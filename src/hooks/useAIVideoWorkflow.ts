import { useCallback } from 'react';
import { createPersistedAIState, selectCoverCandidate } from '../lib/ai-persistence';
import { getAISettingsIssue } from '../lib/ai-settings';
import {
  DEFAULT_WORKFLOW,
  loadAISettings,
  type WorkflowStep,
  useAIStore,
} from '../store/ai';
import { getProjectDir, useTimelineStore } from '../store/timeline';
import {
  buildAICardTimelineDraft,
  type AIAnalysisResult,
  type CoverCandidate,
} from '../types/ai';

interface WorkflowStartOptions {
  pauseAfterTts?: boolean;
}

interface WorkflowSessionState {
  requestId: string;
  retryStep: WorkflowStep;
  scriptText: string;
  projectDir: string;
  pauseAfterTts: boolean;
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
  cancelled: false,
};

function resetWorkflowSession(): void {
  workflowSession.requestId = '';
  workflowSession.retryStep = 'tts_generating';
  workflowSession.scriptText = '';
  workflowSession.projectDir = '';
  workflowSession.pauseAfterTts = false;
  workflowSession.cancelled = false;
}

function buildWorkflowError(prefix: string, error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
}

async function persistAIState(
  projectDir: string,
  analysisResult: AIAnalysisResult | null,
  coverCandidates: CoverCandidate[],
): Promise<void> {
  if (!projectDir) {
    return;
  }

  const nextState = createPersistedAIState(analysisResult, coverCandidates);
  await window.electronAPI.saveAIAnalysis(projectDir, JSON.stringify(nextState, null, 2));
}

export function useAIVideoWorkflow() {
  const workflow = useAIStore((state) => state.workflow);
  const setWorkflow = useAIStore((state) => state.setWorkflow);
  const resetWorkflow = useAIStore((state) => state.resetWorkflow);
  const setAnalysisResult = useAIStore((state) => state.setAnalysisResult);
  const setCoverCandidates = useAIStore((state) => state.setCoverCandidates);
  const selectCover = useAIStore((state) => state.selectCover);
  const timelineStore = useTimelineStore();

  const runFromStep = useCallback(
    async (
      fromStep: WorkflowStep,
      scriptText: string,
      projectDir: string,
    ) => {
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

        const cleanupProgress = window.electronAPI.onTTSProgress((pct) => {
          setWorkflow({ progress: pct });
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
          timelineStore.setPodcast(
            ttsResult.audioPath,
            ttsResult.srtPath,
            actualDurationMs > 0 ? actualDurationMs : ttsResult.durationMs,
          );

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

          setWorkflow({
            step: 'error',
            progress: 0,
            stepLabel: '',
            error: buildWorkflowError('语音生成失败', error),
            canCancel: false,
          });
          workflowSession.retryStep = 'tts_generating';
          return;
        }
      }

      if (isStaleRun()) {
        return;
      }

      if (fromStep === 'ai_analyzing' || fromStep === 'tts_done') {
        setWorkflow({
          step: 'ai_analyzing',
          progress: 12,
          stepLabel: '正在分析内容…',
          error: null,
          canCancel: false,
        });

        try {
          const analysisResult = (await window.electronAPI.analyzeSrt({
            entries: useTimelineStore.getState().srtEntries,
            settings,
          })) as AIAnalysisResult;

          setAnalysisResult(analysisResult);
          setCoverCandidates([]);
          await persistAIState(projectDir, analysisResult, []);
          setWorkflow({
            step: 'cover_generating',
            progress: 36,
            stepLabel: '正在生成封面…',
            error: null,
            canCancel: false,
          });
          workflowSession.retryStep = 'cover_generating';
          fromStep = 'cover_generating';
        } catch (error) {
          setWorkflow({
            step: 'error',
            progress: 0,
            stepLabel: '',
            error: buildWorkflowError('内容分析失败', error),
            canCancel: false,
          });
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

        if (coverPrompts.length > 0) {
          try {
            let nextCandidates = await window.electronAPI.generateCoverImages({
              prompts: coverPrompts,
              settings,
              projectDir,
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
              setWorkflow({
                progress: Math.round(72 + ((index + 1) / drafts.length) * 24),
                stepLabel: `正在排布时间轴… ${index + 1}/${drafts.length}`,
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
        } catch (error) {
          setWorkflow({
            step: 'error',
            progress: 0,
            stepLabel: '',
            error: buildWorkflowError('时间轴排布失败', error),
            canCancel: false,
          });
          workflowSession.retryStep = 'arranging';
        }
      }
    },
    [selectCover, setAnalysisResult, setCoverCandidates, setWorkflow, timelineStore],
  );

  const start = useCallback(
    (scriptText: string, options?: WorkflowStartOptions) => {
      resetWorkflowSession();
      workflowSession.requestId = crypto.randomUUID();
      workflowSession.retryStep = 'tts_generating';
      workflowSession.scriptText = scriptText;
      workflowSession.projectDir = getProjectDir() ?? '';
      workflowSession.pauseAfterTts = options?.pauseAfterTts ?? false;

      void runFromStep('tts_generating', scriptText, workflowSession.projectDir);
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
