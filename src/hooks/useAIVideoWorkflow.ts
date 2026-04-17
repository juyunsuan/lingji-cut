import { useCallback } from 'react';
import { createPersistedAIState, selectCoverCandidate } from '../lib/ai-persistence';
import { getAISettingsIssue } from '../lib/ai-settings';
import { serializeSrtEntries } from '../lib/srt-parser';
import {
  DEFAULT_WORKFLOW,
  loadAISettings,
  type WorkflowStep,
  useAIStore,
} from '../store/ai';
import { getProjectDir, useTimelineStore } from '../store/timeline';
import { useTaskProgressStore, type TaskProgressItem } from '../store/task-progress';
import {
  buildAICardTimelineDraft,
  type AIAnalysisResult,
  type CoverCandidate,
} from '../types/ai';

interface WorkflowStartOptions {
  pauseAfterTts?: boolean;
  /**
   * 仅重跑 TTS：TTS 完成后直接把 workflow 状态回到 idle，
   * 不触发 Editor 侧的 tts_done 自动续跑（AI 分析/封面/排版）。
   * 用于"从文稿重新生成口播"的场景。
   */
  ttsOnly?: boolean;
  startFromStep?: Extract<WorkflowStep, 'tts_generating' | 'ai_analyzing'>;
}

interface WorkflowSessionState {
  requestId: string;
  retryStep: WorkflowStep;
  scriptText: string;
  projectDir: string;
  pauseAfterTts: boolean;
  ttsOnly: boolean;
  cancelled: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const workflowSession: WorkflowSessionState = {
  requestId: '',
  retryStep: 'tts_generating',
  scriptText: '',
  projectDir: '',
  pauseAfterTts: false,
  ttsOnly: false,
  cancelled: false,
};

function resetWorkflowSession(): void {
  workflowSession.requestId = '';
  workflowSession.retryStep = 'tts_generating';
  workflowSession.scriptText = '';
  workflowSession.projectDir = '';
  workflowSession.pauseAfterTts = false;
  workflowSession.ttsOnly = false;
  workflowSession.cancelled = false;
}

function buildWorkflowError(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
}

function ensureWorkflowTask(
  taskId: string,
  task: Omit<TaskProgressItem, 'startedAt' | 'status'>,
): void {
  const store = useTaskProgressStore.getState();

  if (store.tasks.has(taskId)) {
    store.updateTask(taskId, {
      category: task.category,
      label: task.label,
      mode: task.mode,
      progress: task.progress,
      phase: task.phase,
      canCancel: task.canCancel,
    });
    return;
  }

  store.startTask(task);
}

async function hydrateReusablePodcastMedia(): Promise<void> {
  const timelineState = useTimelineStore.getState();
  const audioPath = timelineState.timeline.podcast.audioPath?.trim() ?? '';
  const srtPath = timelineState.timeline.podcast.srtPath?.trim() ?? '';

  if (!srtPath) {
    throw new Error('未找到可复用的字幕文件，请重新生成音频与字幕');
  }

  if (timelineState.srtEntries.length > 0 && timelineState.timeline.podcast.durationMs > 0) {
    return;
  }

  const { entries, durationMs } = await window.electronAPI.parseSrtFile(srtPath);
  const actualDurationMs = audioPath
    ? await window.electronAPI.getAudioDuration(audioPath).catch(() => 0)
    : 0;

  timelineState.setSrtEntries(entries);

  // 若 autoResegment 触发了切分，将切分结果写回主 SRT 文件；
  // .original.srt 由 main 进程在首次 TTS 时落盘，此处不改动。
  {
    const postSetState = useTimelineStore.getState();
    if (postSetState.srtEntries.length !== postSetState.originalSrtEntries.length) {
      const hydrateProjectDir = getProjectDir();
      if (hydrateProjectDir) {
        const splitSrtText = serializeSrtEntries(postSetState.srtEntries);
        const projectFileName = srtPath.split(/[\\/]/).pop() ?? 'podcast-subtitles.srt';
        try {
          await window.electronAPI.saveScriptFile(hydrateProjectDir, projectFileName, splitSrtText);
        } catch (error) {
          // 非致命：内存状态已正确，磁盘回写仅做最佳努力
          console.warn('[subtitle] hydrate 切分后写回 SRT 失败，磁盘保留原始版本', error);
        }
      }
    }
  }

  timelineState.setPodcast(
    audioPath,
    srtPath,
    actualDurationMs > 0
      ? actualDurationMs
      : timelineState.timeline.podcast.durationMs > 0
        ? timelineState.timeline.podcast.durationMs
        : durationMs,
  );
}

async function persistAIState(
  projectDir: string,
  analysisResult: AIAnalysisResult | null,
  coverCandidates: CoverCandidate[],
): Promise<void> {
  if (!projectDir) {
    return;
  }

  const motionCards = useAIStore.getState().motionCards;
  const storyboardPlan = useAIStore.getState().storyboardPlan;
  const persistedState = createPersistedAIState(
    analysisResult,
    coverCandidates,
    motionCards,
    storyboardPlan,
  );
  await window.electronAPI.saveProjectSection(
    projectDir,
    'aiAnalysis',
    JSON.stringify(persistedState),
  );
}

export function useAIVideoWorkflow() {
  const workflow = useAIStore((state) => state.workflow);
  const setWorkflow = useAIStore((state) => state.setWorkflow);
  const resetWorkflow = useAIStore((state) => state.resetWorkflow);
  const setAnalysisResult = useAIStore((state) => state.setAnalysisResult);
  const setCoverCandidates = useAIStore((state) => state.setCoverCandidates);
  const setStoryboardPlan = useAIStore((state) => state.setStoryboardPlan);
  const selectCover = useAIStore((state) => state.selectCover);
  const timelineStore = useTimelineStore();

  const runFromStep = useCallback(
    async (
      fromStep: WorkflowStep,
      scriptText: string,
      projectDir: string,
    ) => {
      const workflowTaskId = `ai-workflow-${Date.now()}`;
      const currentRequestId = workflowSession.requestId;
      const isStaleRun = () =>
        workflowSession.cancelled || workflowSession.requestId !== currentRequestId;
      const settings = await loadAISettings();
      const llmSettingsIssue = getAISettingsIssue(settings);

      if (!projectDir) {
        setWorkflow({
          ...DEFAULT_WORKFLOW,
          step: 'error',
          error: '请先选择工程目录后再生成视频',
        });
        return;
      }

      if (!scriptText.trim()) {
        setWorkflow({
          ...DEFAULT_WORKFLOW,
          step: 'error',
          error: '未找到可用于生成视频的文稿内容',
        });
        return;
      }

      if (!settings) {
        setWorkflow({
          ...DEFAULT_WORKFLOW,
          step: 'error',
          error: '请先完成 AI 配置后再生成视频',
        });
        return;
      }

      if (fromStep === 'tts_generating' && !settings.minimaxApiKey.trim()) {
        setWorkflow({
          ...DEFAULT_WORKFLOW,
          step: 'error',
          error: '请先在设置 → TTS 配置中填写 MiniMax API Key',
        });
        return;
      }

      if (
        (fromStep === 'ai_analyzing' ||
          fromStep === 'tts_done' ||
          fromStep === 'cover_generating' ||
          fromStep === 'arranging') &&
        llmSettingsIssue
      ) {
        setWorkflow({
          ...DEFAULT_WORKFLOW,
          step: 'error',
          error: llmSettingsIssue,
        });
        workflowSession.retryStep = 'ai_analyzing';
        return;
      }

      if (fromStep === 'tts_generating') {
        setWorkflow({
          step: 'tts_generating',
          progress: 0,
          stepLabel: '正在生成语音…',
          error: null,
          canCancel: true,
        });

        useTaskProgressStore.getState().startTask({
          id: workflowTaskId,
          category: 'tts',
          label: 'TTS 语音合成',
          mode: 'determinate',
          progress: 0,
          phase: '生成语音',
          level: 2,
          canCancel: true,
          onCancel: () => {
            workflowSession.cancelled = true;
            if (currentRequestId) {
              void window.electronAPI.cancelTTS(currentRequestId);
            }
          },
        });

        const cleanupProgress = window.electronAPI.onTTSProgress((pct) => {
          setWorkflow({ progress: pct });
          useTaskProgressStore.getState().updateTask(workflowTaskId, { progress: pct });
        });

        try {
          const ttsResult = await window.electronAPI.generateTTS({
            requestId: currentRequestId,
            text: scriptText,
            voiceId: settings.minimaxVoiceId || 'male-qn-qingse',
            speed: settings.minimaxSpeed ?? 1,
            vol: settings.minimaxVol ?? 1,
            pitch: settings.minimaxPitch ?? 0,
            emotion: settings.minimaxEmotion ?? '',
            model: settings.minimaxModel ?? 'speech-2.8-hd',
            apiKey: settings.minimaxApiKey,
            projectDir,
          });

          cleanupProgress();

          if (isStaleRun()) {
            return;
          }

          const { entries } = await window.electronAPI.parseSrtFile(ttsResult.srtPath);
          const actualDurationMs = await window.electronAPI.getAudioDuration(ttsResult.audioPath).catch(() => 0);
          timelineStore.setSrtEntries(entries);

          // 若 autoResegment 触发了切分，store 中的 srtEntries 比 originalSrtEntries 更多；
          // 将切分结果写回主 SRT 文件，.original.srt 已由 main 进程保留原始副本。
          {
            const postSetState = useTimelineStore.getState();
            if (postSetState.srtEntries.length !== postSetState.originalSrtEntries.length) {
              const splitSrtText = serializeSrtEntries(postSetState.srtEntries);
              const projectFileName = ttsResult.srtPath.split(/[\\/]/).pop() ?? 'podcast-subtitles.srt';
              try {
                await window.electronAPI.saveScriptFile(projectDir, projectFileName, splitSrtText);
              } catch (error) {
                // 非致命：内存状态已正确，磁盘回写仅做最佳努力
                console.warn('[subtitle] 切分后写回 SRT 失败，磁盘保留原始版本', error);
              }
            }
          }

          timelineStore.setPodcast(
            ttsResult.audioPath,
            ttsResult.srtPath,
            actualDurationMs > 0 ? actualDurationMs : ttsResult.durationMs,
          );

          // ttsOnly：仅重跑口播，完成后立刻收回到 idle，
          // 避免 Editor 里 tts_done 自动续跑 AI 分析/封面/排版。
          if (workflowSession.ttsOnly) {
            useTaskProgressStore.getState().updateTask(workflowTaskId, {
              label: '口播音频已更新',
              phase: '完成',
              progress: 100,
            });
            useTaskProgressStore.getState().completeTask(workflowTaskId);
            setWorkflow({ ...DEFAULT_WORKFLOW });
            workflowSession.retryStep = 'tts_generating';
            return;
          }

          setWorkflow({
            step: 'tts_done',
            progress: 100,
            stepLabel: '语音生成完成',
            error: null,
            canCancel: false,
          });

          workflowSession.retryStep = 'ai_analyzing';

          if (workflowSession.pauseAfterTts) {
            return;
          }

          fromStep = 'ai_analyzing';
        } catch (error) {
          cleanupProgress();

          if (isStaleRun()) {
            return;
          }

          const ttsErrorMsg = buildWorkflowError('语音生成失败', error);
          setWorkflow({
            step: 'error',
            progress: 0,
            stepLabel: '',
            error: ttsErrorMsg,
            canCancel: false,
          });
          useTaskProgressStore.getState().failTask(workflowTaskId, ttsErrorMsg);
          workflowSession.retryStep = 'tts_generating';
          return;
        }
      }

      if (isStaleRun()) {
        return;
      }

      if (fromStep === 'ai_analyzing' || fromStep === 'tts_done') {
        ensureWorkflowTask(workflowTaskId, {
          id: workflowTaskId,
          category: 'ai-analyze',
          label: '准备分析素材',
          mode: 'determinate',
          progress: 5,
          phase: '准备中',
          level: 2,
          canCancel: false,
        });

        try {
          await hydrateReusablePodcastMedia();
        } catch (error) {
          const reuseErrorMsg = buildWorkflowError('复用已有音频与字幕失败', error);
          setWorkflow({
            step: 'error',
            progress: 0,
            stepLabel: '',
            error: reuseErrorMsg,
            canCancel: false,
          });
          useTaskProgressStore.getState().failTask(workflowTaskId, reuseErrorMsg);
          workflowSession.retryStep = 'tts_generating';
          return;
        }

        setWorkflow({
          step: 'ai_analyzing',
          progress: 12,
          stepLabel: '正在分析内容…',
          error: null,
          canCancel: false,
        });

        ensureWorkflowTask(workflowTaskId, {
          id: workflowTaskId,
          category: 'ai-analyze',
          label: 'AI 内容分析',
          mode: 'determinate',
          progress: 12,
          phase: '分析中',
          level: 2,
          canCancel: false,
        });

        try {
          const analysisResult = (await window.electronAPI.analyzeSrt({
            entries: useTimelineStore.getState().srtEntries,
            settings,
            projectDir,
            projectBindings: useAIStore.getState().projectBindings,
          })) as AIAnalysisResult;

          setAnalysisResult(analysisResult);
          setStoryboardPlan(null);
          setCoverCandidates([]);
          await persistAIState(projectDir, analysisResult, []);
          setWorkflow({
            step: 'cover_generating',
            progress: 36,
            stepLabel: '正在生成封面…',
            error: null,
            canCancel: false,
          });
          useTaskProgressStore.getState().updateTask(workflowTaskId, {
            label: '封面图生成',
            phase: '生成中',
            progress: 36,
          });
          workflowSession.retryStep = 'cover_generating';
          fromStep = 'cover_generating';
        } catch (error) {
          const analyzeErrorMsg = buildWorkflowError('内容分析失败', error);
          setWorkflow({
            step: 'error',
            progress: 0,
            stepLabel: '',
            error: analyzeErrorMsg,
            canCancel: false,
          });
          useTaskProgressStore.getState().failTask(workflowTaskId, analyzeErrorMsg);
          workflowSession.retryStep = 'ai_analyzing';
          return;
        }
      }

      if (isStaleRun()) {
        return;
      }

      if (fromStep === 'cover_generating') {
        const { analysisResult } = useAIStore.getState();
        const coverPrompts = analysisResult?.coverPrompts ?? [];

        ensureWorkflowTask(workflowTaskId, {
          id: workflowTaskId,
          category: 'cover',
          label: '封面图生成',
          mode: 'determinate',
          progress: 36,
          phase: '生成中',
          level: 2,
          canCancel: false,
        });

        if (coverPrompts.length > 0) {
          try {
            let nextCandidates = await window.electronAPI.generateCoverImages({
              prompts: coverPrompts,
              settings,
              projectDir,
              projectBindings: useAIStore.getState().projectBindings,
            });

            const validCandidates = nextCandidates.filter(
              (candidate) => candidate.imageUrl && !candidate.error,
            );

            if (validCandidates.length > 0) {
              const randomPick =
                validCandidates[Math.floor(Math.random() * validCandidates.length)];
              nextCandidates = selectCoverCandidate(nextCandidates, randomPick.id);
              selectCover(randomPick.id);
              timelineStore.setGlobalBackground(randomPick.imageUrl);
            }

            setCoverCandidates(nextCandidates);
            await persistAIState(projectDir, analysisResult, nextCandidates);
          } catch (error) {
            console.warn('封面生成失败，继续后续时间轴排布:', error);
          }
        } else {
          setCoverCandidates([]);
          await persistAIState(projectDir, analysisResult, []);
        }

        setWorkflow({
          step: 'arranging',
          progress: 72,
          stepLabel: '正在排布时间轴…',
          error: null,
          canCancel: false,
        });
        workflowSession.retryStep = 'arranging';
        fromStep = 'arranging';
      }

      if (isStaleRun()) {
        return;
      }

      if (fromStep === 'arranging') {
        try {
          const { analysisResult } = useAIStore.getState();
          const allCards = analysisResult?.cards ?? [];
          const drafts = allCards
            .filter((card) => card.enabled)
            .map(buildAICardTimelineDraft);

          ensureWorkflowTask(workflowTaskId, {
            id: workflowTaskId,
            category: 'ai-analyze',
            label: '时间轴排布',
            mode: 'determinate',
            progress: 72,
            phase: '排布中',
            level: 2,
            canCancel: false,
          });

          if (isStaleRun()) {
            return;
          }

          timelineStore.removeAICardOverlaysBySourceIds(allCards.map((card) => card.id));

          if (drafts.length > 0) {
            for (const [index, draft] of drafts.entries()) {
              if (isStaleRun()) {
                return;
              }

              timelineStore.addAICardsToTimeline([draft]);
              const arrangingProgress = Math.round(72 + ((index + 1) / drafts.length) * 24);
              setWorkflow({
                progress: arrangingProgress,
                stepLabel: `正在排布时间轴… ${index + 1}/${drafts.length}`,
              });
              useTaskProgressStore.getState().updateTask(workflowTaskId, {
                category: 'ai-analyze',
                label: '时间轴排布',
                phase: '排布中',
                progress: arrangingProgress,
                canCancel: false,
              });
              await sleep(90);
            }
          }

          setWorkflow({
            step: 'done',
            progress: 100,
            stepLabel: '视频草稿已准备完成',
            error: null,
            canCancel: false,
          });
          useTaskProgressStore.getState().completeTask(workflowTaskId);
        } catch (error) {
          const arrangingErrorMsg = buildWorkflowError('时间轴排布失败', error);
          setWorkflow({
            step: 'error',
            progress: 0,
            stepLabel: '',
            error: arrangingErrorMsg,
            canCancel: false,
          });
          useTaskProgressStore.getState().failTask(workflowTaskId, arrangingErrorMsg);
          workflowSession.retryStep = 'arranging';
        }
      }
    },
    [
      selectCover,
      setAnalysisResult,
      setCoverCandidates,
      setStoryboardPlan,
      setWorkflow,
      timelineStore,
    ],
  );

  const start = useCallback(
    async (scriptText: string, options?: WorkflowStartOptions) => {
      resetWorkflowSession();
      workflowSession.requestId = crypto.randomUUID();
      const initialStep = options?.startFromStep ?? 'tts_generating';
      workflowSession.retryStep = initialStep;
      workflowSession.projectDir = getProjectDir() ?? '';
      workflowSession.pauseAfterTts = options?.pauseAfterTts ?? false;
      workflowSession.ttsOnly = options?.ttsOnly ?? false;

      // 优先使用传入文本，否则从磁盘读取 script.md
      let text = scriptText;
      if (!text.trim() && workflowSession.projectDir) {
        const diskText = await window.electronAPI.loadScriptFile(
          workflowSession.projectDir,
          'script.md',
        );
        text = diskText ?? '';
      }
      workflowSession.scriptText = text;

      void runFromStep(initialStep, text, workflowSession.projectDir);
    },
    [runFromStep],
  );

  const cancel = useCallback(() => {
    const currentRequestId = workflowSession.requestId;
    workflowSession.cancelled = true;

    if (currentRequestId) {
      void window.electronAPI.cancelTTS(currentRequestId);
    }

    resetWorkflow();
  }, [resetWorkflow]);

  const retry = useCallback(() => {
    workflowSession.cancelled = false;
    if (
      !workflowSession.requestId ||
      workflowSession.retryStep === 'tts_generating'
    ) {
      workflowSession.requestId = crypto.randomUUID();
    }

    if (!workflowSession.projectDir) {
      workflowSession.projectDir = getProjectDir() ?? '';
    }

    void runFromStep(
      workflowSession.retryStep,
      workflowSession.scriptText,
      workflowSession.projectDir,
    );
  }, [runFromStep]);

  const continueFromTtsDone = useCallback(
    (projectDir?: string) => {
      workflowSession.cancelled = false;
      workflowSession.pauseAfterTts = false;
      workflowSession.projectDir = projectDir || workflowSession.projectDir || getProjectDir() || '';
      void runFromStep(
        'ai_analyzing',
        workflowSession.scriptText,
        workflowSession.projectDir,
      );
    },
    [runFromStep],
  );

  return {
    start,
    cancel,
    retry,
    continueFromTtsDone,
    workflow,
  };
}
