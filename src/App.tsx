import { AnimatePresence, LayoutGroup, m } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from './ui';
import { AgentSidebar } from './components/agent/AgentSidebar';
import { AppStatusBar } from './components/AppStatusBar';
import { Toolbar } from './components/Toolbar';
import type { AppPage, MenuAction, MenuEvent, RecentProjectEntry } from './lib/electron-api';
import { getAISettingsIssue } from './lib/ai-settings';
import { useAgentStore } from './store/agent';
import { createPersistedAIState } from './lib/ai-persistence';
import { hydrateSettingsStorage } from './lib/settings-storage';
import { useViewportSize } from './hooks/useViewportSize';
import { getAppShortcutCommand, isTextEditingTarget } from './lib/native-shortcuts';
import { resolvePageTransition, type PageTransitionReason } from './lib/page-transition';
import { resolveProjectLandingPage } from './lib/project-navigation';
import { createBlankScriptProjectState } from './lib/script-project';
import { Editor } from './pages/Editor';
import { ScriptWorkbench } from './pages/ScriptWorkbench';
import { Settings } from './pages/Settings';
import { Setup } from './pages/Setup';
import { AutoRunController } from './components/AutoRunController';
import { ImportProjectDialog } from './components/ImportProjectDialog';
import type { ImportProjectResult } from './lib/project-import-types';
import { prefersReducedMotion } from './ui/lib/animation-config';
import { WorkspaceTabs } from './components/WorkspaceTabs';
import { getFileNameFromPath, readAudioDurationMs } from './lib/utils';
import { createDefaultTimeline } from './types';
import type { AICard, AIAnalysisResult } from './types/ai';
import { getCurrentAISaveStatus, loadAISettings, subscribeToAISaveStatus, useAIStore, type AutoWorkflowParams } from './store/ai';
import type { ProjectData } from './lib/project-persistence';
import { useScriptStore } from './store/script';
import { getRoleById } from './lib/script-templates';
import { SCRIPT_TEMPLATE_SEEDS } from './lib/prompts/script-template-defaults';
import {
  clearCurrentProject,
  getCurrentProjectDir,
  getCurrentSaveStatus,
  type SaveStatus,
  setProjectDir,
  subscribeToSaveStatus,
  useTimelineStore,
} from './store/timeline';

const APP_FONT_STACK =
  '"SF Pro Text", "SF Pro Display", "PingFang SC", -apple-system, BlinkMacSystemFont, sans-serif';
const APP_LOADING_BACKGROUND = 'var(--color-window-bg)';
const APP_WINDOW_BACKGROUND = 'var(--color-window-bg)';

export default function App() {
  const viewport = useViewportSize();
  const [page, setPageRaw] = useState<AppPage>('welcome');
  const [previousPage, setPreviousPage] = useState<AppPage>('welcome');
  const [pageTransitionReason, setPageTransitionReason] = useState<PageTransitionReason>('default');

  const setPage = useCallback(
    (next: AppPage, reason: PageTransitionReason = 'default') => {
      setPageRaw((current) => {
        setPreviousPage(current);
        setPageTransitionReason(reason);
        return next;
      });
    },
    [],
  );
  const [isHydrating, setIsHydrating] = useState(() => Boolean(getCurrentProjectDir()));
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [currentProjectDir, setCurrentProjectDir] = useState(() => getCurrentProjectDir());
  const [recentProjects, setRecentProjects] = useState<RecentProjectEntry[]>([]);
  const [saveStatus, setSaveStatus] = useState(() => getCurrentSaveStatus());
  const [aiSaveStatus, setAISaveStatus] = useState(() => getCurrentAISaveStatus());
  const aggregatedSaveStatus: SaveStatus = (() => {
    if (saveStatus === 'error' || aiSaveStatus === 'error') return 'error';
    if (saveStatus === 'saving' || aiSaveStatus === 'saving') return 'saving';
    if (saveStatus === 'saved' || aiSaveStatus === 'saved') return 'saved';
    return saveStatus;
  })();
  const [exportRequestToken, setExportRequestToken] = useState(0);
  const {
    addAsset,
    canRedo,
    canUndo,
    redo,
    setPodcast,
    setSrtEntries,
    setTimeline,
    timeline,
    undo,
  } = useTimelineStore();
  const clearAIAnalysis = useAIStore((state) => state.clearAnalysis);
  const setAIAnalysisResult = useAIStore((state) => state.setAnalysisResult);
  const { showToast } = useToast();
  const setCoverCandidates = useAIStore((state) => state.setCoverCandidates);
  const setMotionCards = useAIStore((state) => state.setMotionCards);
  const setGeneratingMotion = useAIStore((state) => state.setGeneratingMotion);
  const setMotionError = useAIStore((state) => state.setMotionError);
  const setStoryboardPlan = useAIStore((state) => state.setStoryboardPlan);

  const loadUserPrompts = useAIStore((state) => state.loadUserPrompts);

  useEffect(() => {
    void hydrateSettingsStorage();
    // 启动即加载口播模板分类，MCP / 写稿 / 抽屉都依赖这份缓存
    void loadUserPrompts('script-template');
  }, [loadUserPrompts]);

  // --- MCP 只读型 Handler（全局注册，独立于 ScriptWorkbench 页面生命周期）---
  // 这些 handler 只依赖 Zustand store，不依赖 ScriptWorkbench 的 ref/回调，
  // 必须在 App 层注册，避免用户在 settings 等页面时 ScriptWorkbench 未挂载导致 MCP 工具调用卡死。
  useEffect(() => {
    if (!window.mcpAPI) return;
    const unsubs: Array<() => void> = [];

    // 获取编辑器状态
    unsubs.push(
      window.mcpAPI.onGetEditorState((payload: any) => {
        const state = useScriptStore.getState();
        window.mcpAPI!.reply(payload._replyChannel, {
          projectDir: state.projectDir,
          openFiles: state.fileEntries.map((f) => f.name),
          activeFile: state.openedFile,
          cursorPosition: null,
        });
      }),
    );

    // 读取脚本文件内容
    unsubs.push(
      window.mcpAPI.onReadScript((payload: any) => {
        const state = useScriptStore.getState();
        let filePath = payload.filePath || state.openedFile || 'script.md';
        // 标准化：将绝对路径转为项目目录下的相对路径
        if (state.projectDir && filePath.startsWith(state.projectDir)) {
          filePath = filePath.slice(state.projectDir.length).replace(/^\//, '');
        }
        let content = '';
        if (filePath === 'script.md') {
          content = state.scriptText;
        } else if (filePath === 'original.md') {
          content = state.originalText;
        } else {
          content = state.extraFileContents[filePath] ?? '';
        }
        const lineCount = content ? content.split('\n').length : 0;
        window.mcpAPI!.reply(payload._replyChannel, { filePath, content, lineCount });
      }),
    );

    // 提交审查批注
    unsubs.push(
      window.mcpAPI.onSubmitReview((payload: any) => {
        const state = useScriptStore.getState();
        const annotationsInput: Array<{
          quotedText?: string;
          line?: number;
          endLine?: number;
          text: string;
          suggestion?: string;
          severity?: string;
        }> = payload.annotations ?? [];
        const scriptContent = state.scriptText;
        const scriptLines = scriptContent.split('\n');

        // 预计算行偏移表（仅在需要行号定位时使用）
        const lineOffsets: number[] = [0];
        for (let i = 0; i < scriptLines.length; i++) {
          lineOffsets.push(lineOffsets[i] + scriptLines[i].length + 1);
        }

        const newAnnotations: typeof state.annotations = [];
        let skipped = 0;

        for (let idx = 0; idx < annotationsInput.length; idx++) {
          const a = annotationsInput[idx];
          let startOffset: number;
          let endOffset: number;
          let originalText: string;

          if (a.quotedText) {
            // 优先使用 quotedText 精确匹配
            const matchIdx = scriptContent.indexOf(a.quotedText);
            if (matchIdx === -1) {
              skipped++;
              continue;
            }
            startOffset = matchIdx;
            endOffset = matchIdx + a.quotedText.length;
            originalText = a.quotedText;
          } else if (a.line != null) {
            // 降级到行号定位
            const startLine = Math.max(1, Math.min(a.line, scriptLines.length));
            const endLine = Math.max(startLine, Math.min(a.endLine ?? startLine, scriptLines.length));
            startOffset = lineOffsets[startLine - 1];
            endOffset = lineOffsets[endLine] - 1;
            originalText = scriptLines.slice(startLine - 1, endLine).join('\n');
          } else {
            skipped++;
            continue;
          }

          newAnnotations.push({
            id: `mcp-review-${Date.now()}-${idx}`,
            startOffset,
            endOffset,
            originalText,
            quotedText: originalText,
            docVersion: state.scriptDocVersion,
            issue: a.text,
            suggestion: a.suggestion ?? '',
            severity: (['error', 'warning', 'info'].includes(a.severity ?? '') ? a.severity as 'error' | 'warning' | 'info' : 'info'),
            status: 'pending' as const,
          });
        }

        state.setAnnotations(newAnnotations);
        state.setReviewState(newAnnotations.length > 0 ? 'issues' : 'clean');

        window.mcpAPI!.reply(payload._replyChannel, {
          success: true,
          filePath: 'script.md',
          annotationCount: newAnnotations.length,
          skipped,
        });
      }),
    );

    // 列出项目文件
    unsubs.push(
      window.mcpAPI.onListProjectFiles((payload: any) => {
        const state = useScriptStore.getState();
        window.mcpAPI!.reply(payload._replyChannel, {
          projectDir: state.projectDir,
          files: state.fileEntries.map((f) => ({
            path: f.name,
            name: f.name,
            isDirectory: f.type === 'directory',
          })),
        });
      }),
    );

    // 获取项目上下文
    unsubs.push(
      window.mcpAPI.onGetProjectContext((payload: any) => {
        const state = useScriptStore.getState();
        // 直接从 AIStore 读口播模板条目，避免耦合 script-templates.ts
        const userTemplates = useAIStore.getState().userPromptEntries['script-template'] ?? [];
        // 极早期（App hydrate 尚未完成 loadUserPrompts）时用内置种子兜底
        const effectiveTemplates = userTemplates.length > 0
          ? userTemplates.map((entry) => ({
              id: entry.id,
              name: entry.name,
              description: entry.description,
              systemPrompt: entry.system,
            }))
          : SCRIPT_TEMPLATE_SEEDS.map((seed) => ({
              id: seed.id,
              name: seed.name,
              description: seed.description,
              systemPrompt: seed.system,
            }));
        const selectedTpl = effectiveTemplates.find((t) => t.id === state.selectedTemplate);
        const selectedRole = getRoleById(state.selectedRole);
        window.mcpAPI!.reply(payload._replyChannel, {
          projectName: state.projectDir?.split('/').pop() ?? null,
          projectDir: state.projectDir,
          selectedTemplate: state.selectedTemplate,
          selectedTemplatePrompt: selectedTpl?.systemPrompt ?? null,
          selectedRole: selectedRole ? {
            id: selectedRole.id,
            name: selectedRole.name,
            description: selectedRole.description,
            rolePrompt: selectedRole.rolePrompt,
          } : null,
          roleInstruction: selectedRole && selectedRole.id !== 'none'
            ? `【重要】用户已选择「${selectedRole.name}」作为口播角色。写稿时请严格遵循以下角色设定：\n${selectedRole.rolePrompt}\n请将此角色风格融入模板要求中生成口播稿。`
            : null,
          templates: effectiveTemplates,
          hasOriginalFile: state.workspaceFiles.hasOriginalFile,
          hasScriptFile: state.workspaceFiles.hasScriptFile,
        });
      }),
    );

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, []);

  const invalidateAIAnalysis = useCallback(async (projectDir?: string) => {
    clearAIAnalysis();

    if (!projectDir) {
      return;
    }

    const motionCards = useAIStore.getState().motionCards;
    const storyboardPlan = useAIStore.getState().storyboardPlan;

    await window.electronAPI.saveAIAnalysis(
      projectDir,
      JSON.stringify(createPersistedAIState(null, [], motionCards, storyboardPlan), null, 2),
    );
  }, [clearAIAnalysis]);

  const persistAIAnalysis = useCallback(
    async (analysisResult: AIAnalysisResult | null) => {
      if (!currentProjectDir) {
        return;
      }

      const motionCards = useAIStore.getState().motionCards;
      const storyboardPlan = useAIStore.getState().storyboardPlan;

      await window.electronAPI.saveAIAnalysis(
        currentProjectDir,
        JSON.stringify(
          createPersistedAIState(analysisResult, [], motionCards, storyboardPlan),
          null,
          2,
        ),
      );
    },
    [currentProjectDir],
  );

  const rerunAiAnalysisForEntries = useCallback(
    async (entries: ReturnType<typeof useTimelineStore.getState>['srtEntries']) => {
      const settings = await loadAISettings();
      const settingsIssue = getAISettingsIssue(settings);

      clearAIAnalysis();
      await persistAIAnalysis(null);

      if (settingsIssue || !settings) {
        window.alert(settingsIssue ?? '请先完成 AI 配置后再重新分析');
        return;
      }

      try {
        const result = (await window.electronAPI.analyzeSrt({
          entries,
          settings,
          projectDir: currentProjectDir ?? undefined,
          projectBindings: useAIStore.getState().projectBindings,
        })) as AIAnalysisResult;
        setAIAnalysisResult(result);
        setCoverCandidates([]);
        await persistAIAnalysis(result);
      } catch (error) {
        console.error('重新分析字幕失败:', error);
        window.alert(error instanceof Error ? error.message : '重新分析字幕失败，请稍后重试。');
      }
    },
    [clearAIAnalysis, currentProjectDir, persistAIAnalysis, setAIAnalysisResult, setCoverCandidates],
  );

  const resolveAudioDuration = useCallback(
    async (audioPath: string, fallbackDurationMs: number) => {
      try {
        const durationMs = await window.electronAPI.getAudioDuration(audioPath);
        return durationMs > 0 ? durationMs : fallbackDurationMs;
      } catch (error) {
        console.warn('读取音频时长失败，使用兜底时长:', error);
        return fallbackDurationMs;
      }
    },
    [],
  );

  const replaceSubtitleWithConfirmation = useCallback(
    async (srtPath: string) => {
      const { entries, durationMs } = await window.electronAPI.parseSrtFile(srtPath);
      setSrtEntries(entries);
      setPodcast(timeline.podcast.audioPath, srtPath, durationMs);

      const shouldReanalyze = window.confirm(
        '替换字幕后，AI 卡片将失效。是否立即重新分析？',
      );

      if (!shouldReanalyze) {
        return;
      }

      await rerunAiAnalysisForEntries(entries);
    },
    [rerunAiAnalysisForEntries, setPodcast, setSrtEntries, timeline.podcast.audioPath],
  );

  const syncWorkspaceState = useCallback(async () => {
    setCurrentProjectDir(getCurrentProjectDir());
    const projects = await window.electronAPI.loadRecentProjects();
    setRecentProjects(projects);
  }, []);

  const resetToSetup = useCallback((reason: PageTransitionReason = 'default') => {
    setTimeline(createDefaultTimeline());
    setSrtEntries([]);
    clearAIAnalysis();
    useScriptStore.getState().clearProjectSession();
    setPage('welcome', reason);
  }, [clearAIAnalysis, setSrtEntries, setTimeline]);

  const openProject = useCallback(
    async (projectDir: string) => {
      try {
        const raw = await window.electronAPI.loadProject(projectDir);
        const projectData = JSON.parse(raw) as ProjectData;

        // timeline 段
        if (projectData.timeline) {
          setTimeline(projectData.timeline);
        } else {
          setTimeline(createDefaultTimeline());
        }

        // SRT 解析（从 timeline.podcast.srtPath）
        if (projectData.timeline?.podcast?.srtPath) {
          try {
            const { entries } = await window.electronAPI.parseSrtFile(
              projectData.timeline.podcast.srtPath,
            );
            setSrtEntries(entries);
          } catch (err) {
            const isNotFound = String(err).includes('ENOENT');
            if (isNotFound) {
              // 文件被外部删除——清除配置引用并继续，不中断恢复流程
              if (projectData.timeline) {
                projectData.timeline.podcast = {
                  ...projectData.timeline.podcast,
                  srtPath: '',
                  audioPath: '',
                };
                await window.electronAPI.saveProjectSection(
                  projectDir,
                  'timeline',
                  JSON.stringify(projectData.timeline),
                );
              }
              setSrtEntries([]);
              showToast('字幕文件已被删除，已从工程配置中移除', {
                type: 'warning',
                duration: 5000,
              });
            } else {
              throw err;
            }
          }
        } else {
          setSrtEntries([]);
        }

        // AI 分析段
        if (projectData.aiAnalysis?.analysisResult) {
          setAIAnalysisResult(projectData.aiAnalysis.analysisResult);
          setCoverCandidates(projectData.aiAnalysis.coverCandidates ?? []);
        } else {
          clearAIAnalysis();
          setCoverCandidates(projectData.aiAnalysis?.coverCandidates ?? []);
        }

        setMotionCards(projectData.aiAnalysis.motionCards ?? []);
        setStoryboardPlan(projectData.aiAnalysis.storyboardPlan ?? null);
        setGeneratingMotion(false);
        setMotionError(null);

        setProjectDir(projectDir);
        // 添加到最近项目列表
        await window.electronAPI.addRecentProject(projectDir);
        void syncWorkspaceState();
        setSetupError(null);
        setPage(resolveProjectLandingPage(projectData));
      } catch (error) {
        console.error('恢复工程失败:', error);
        await window.electronAPI.removeRecentProject(projectDir);
        if (getCurrentProjectDir() === projectDir) {
          clearCurrentProject();
        }
        void syncWorkspaceState();
        resetToSetup();
        setSetupError('恢复工程失败，请重新打开工程或重新导入 MP3 和 SRT。');
      }
    },
    [
      clearAIAnalysis,
      resetToSetup,
      setAIAnalysisResult,
      setCoverCandidates,
      setSrtEntries,
      setStoryboardPlan,
      setTimeline,
      showToast,
      syncWorkspaceState,
    ],
  );

  useEffect(() => {
    void syncWorkspaceState();
  }, [syncWorkspaceState]);

  useEffect(() => {
    const hydrate = async () => {
      const projectDir = getCurrentProjectDir();
      if (!projectDir) {
        setIsHydrating(false);
        return;
      }

      await openProject(projectDir);
      setIsHydrating(false);
    };

    void hydrate();
  }, [openProject]);

  useEffect(() => subscribeToSaveStatus(setSaveStatus), []);
  useEffect(() => subscribeToAISaveStatus(setAISaveStatus), []);

  useEffect(() => {
    void window.electronAPI.setMenuContext({
      activePage: page,
      hasProject: Boolean(currentProjectDir),
      recentProjects: recentProjects.map((project) => ({
        path: project.path,
        name: project.name,
      })),
    });
  }, [currentProjectDir, page, recentProjects]);

  const handleNewProject = useCallback(async () => {
    const projectDir = await window.electronAPI.selectProjectDirectory();
    if (!projectDir) {
      return;
    }

    // 重置当前工程数据，初始化为空白项目
    setTimeline(createDefaultTimeline());
    setSrtEntries([]);
    clearAIAnalysis();
    setProjectDir(projectDir);
    // 添加到最近项目列表
    await window.electronAPI.addRecentProject(projectDir);
    void syncWorkspaceState();
    setSetupError(null);
    setPage(resolveProjectLandingPage());
  }, [clearAIAnalysis, setSrtEntries, setTimeline, syncWorkspaceState]);

  const handleOpenProject = useCallback(async () => {
    const projectDir = await window.electronAPI.selectProjectDirectory();
    if (!projectDir) {
      return;
    }

    await openProject(projectDir);
  }, [openProject]);

  // ── 导入项目（跨机器项目目录识别与路径修复）──
  const [importProjectDialogOpen, setImportProjectDialogOpen] = useState(false);

  const handleOpenImportProject = useCallback(() => {
    setImportProjectDialogOpen(true);
  }, []);

  const handleImportProjectComplete = useCallback(
    async (result: ImportProjectResult) => {
      await window.electronAPI.addRecentProject(result.projectDir, result.projectName);
      setImportProjectDialogOpen(false);
      await openProject(result.projectDir);
    },
    [openProject],
  );

  const handleOpenSettings = useCallback(() => {
    setPage('settings');
  }, [setPage]);

  /**
   * 导入文稿回调：在指定父目录下创建以项目名命名的文件夹，
   * 初始化空白脚本项目状态，将原稿暂存到 store，
   * 导航到脚本工作台后自动写入 original.md 并触发 AI 写稿。
   */
  const handleImportScript = useCallback(
    async (
      parentDir: string,
      projectName: string,
      content: string,
      autoMode: boolean,
      autoParams: AutoWorkflowParams,
    ) => {
      const trimmedName = projectName.trim();
      if (!parentDir || !trimmedName) {
        throw new Error('父目录和项目名不能为空');
      }
      const projectDir = `${parentDir}/${trimmedName}`;

      clearCurrentProject();
      useScriptStore.getState().clearProjectSession();
      useScriptStore.getState().restoreState(createBlankScriptProjectState(projectDir));
      // 暂存原稿，进入工作台后由 useEffect 落盘并起飞 AI 写稿
      useScriptStore.getState().setPendingImportedScript({ content });

      setTimeline(createDefaultTimeline());
      setSrtEntries([]);
      clearAIAnalysis();
      setProjectDir(projectDir);
      await window.electronAPI.addRecentProject(projectDir);
      void syncWorkspaceState();
      setSetupError(null);

      if (autoMode) {
        // 先把原稿落盘——失败时直接抛出，pendingAutoParams 不会被污染
        await window.electronAPI.saveScriptFile(projectDir, 'original.md', content);
        useAIStore.getState().setPendingAutoParams(autoParams);
        // 同时清掉 pending，否则进 ScriptWorkbench 时会被原写稿流程消费
        useScriptStore.getState().setPendingImportedScript(null);
        setPage('auto-run');
        return;
      }

      setPage('script-workbench');
    },
    [clearAIAnalysis, setPage, setSrtEntries, setTimeline, syncWorkspaceState],
  );

  /**
   * 抖音导入回调：在指定父目录下创建以视频标题命名的项目文件夹，
   * 初始化空白脚本项目状态，保存抖音链接到 store，
   * 导航到脚本工作台后自动触发完整的视频下载+转录流程。
   */
  const handleDouyinImport = useCallback(async (
    parentDir: string,
    title: string,
    douyinUrl: string,
    autoMode: boolean,
    autoParams: AutoWorkflowParams,
  ) => {
    const projectDir = `${parentDir}/${title}`;

    clearCurrentProject();
    useScriptStore.getState().clearProjectSession();
    useScriptStore.getState().restoreState(createBlankScriptProjectState(projectDir));
    // 设置待处理的抖音链接，进入工作台后自动触发导入
    useScriptStore.getState().setPendingDouyinUrl(douyinUrl);

    setTimeline(createDefaultTimeline());
    setSrtEntries([]);
    clearAIAnalysis();
    setProjectDir(projectDir);
    await window.electronAPI.addRecentProject(projectDir);
    void syncWorkspaceState();
    setSetupError(null);

    if (autoMode) {
      useAIStore.getState().setPendingAutoParams(autoParams);
      // 注意：pendingDouyinUrl 不在这里清理，由 AutoRunController（Task 10/11）
      // 在抖音下载启动后自行清掉，避免 ScriptWorkbench 后续误消费
      setPage('auto-run');
      return;
    }
    setPage('script-workbench');
  }, [clearAIAnalysis, setPage, setSrtEntries, setTimeline, syncWorkspaceState]);

  const handleCloseProject = useCallback(() => {
    clearCurrentProject();
    void syncWorkspaceState();
    resetToSetup('close-project');
    setSetupError(null);
  }, [resetToSetup, syncWorkspaceState]);

  const handleRemoveRecentProject = useCallback(
    async (projectDir: string) => {
      await window.electronAPI.removeRecentProject(projectDir);
      await syncWorkspaceState();
    },
    [syncWorkspaceState],
  );

  const handleAddAsset = useCallback(async () => {
    const asset = await window.electronAPI.addAsset();
    if (!asset) {
      return;
    }

    let durationMs = asset.durationMs;
    if (asset.type === 'audio') {
      try {
        const decoded = await readAudioDurationMs(asset.path);
        if (decoded > 0) {
          durationMs = decoded;
        }
      } catch (error) {
        console.warn('读取导入音频时长失败，使用主进程回退值:', error);
      }
    }

    addAsset(asset.path, asset.type, durationMs);
  }, [addAsset]);

  const handleReplaceAudio = useCallback(async () => {
    const audioPath = await window.electronAPI.selectMediaFile('audio');
    if (!audioPath) {
      return;
    }

    const durationMs = await resolveAudioDuration(audioPath, timeline.podcast.durationMs);
    setPodcast(audioPath, timeline.podcast.srtPath, durationMs);
  }, [resolveAudioDuration, setPodcast, timeline.podcast.durationMs, timeline.podcast.srtPath]);

  const handleReplaceSrt = useCallback(async () => {
    const srtPath = await window.electronAPI.selectMediaFile('srt');
    if (!srtPath) {
      return;
    }

    await replaceSubtitleWithConfirmation(srtPath);
  }, [replaceSubtitleWithConfirmation]);

  const handleUseAssetAsPodcastAudio = useCallback(
    async (audioPath: string, durationMs: number) => {
      const resolvedDuration = await resolveAudioDuration(
        audioPath,
        durationMs > 0 ? durationMs : timeline.podcast.durationMs,
      );
      setPodcast(audioPath, timeline.podcast.srtPath, resolvedDuration);
    },
    [resolveAudioDuration, setPodcast, timeline.podcast.durationMs, timeline.podcast.srtPath],
  );

  const handleUseAssetAsPodcastSrt = useCallback(
    async (srtPath: string) => {
      await replaceSubtitleWithConfirmation(srtPath);
    },
    [replaceSubtitleWithConfirmation],
  );

  const handleCommand = useCallback(
    async (command: MenuAction) => {
      switch (command) {
        case 'new-project':
          await handleNewProject();
          return;
        case 'open-project':
          await handleOpenProject();
          return;
        case 'open-settings':
          handleOpenSettings();
          return;
        case 'close-project':
          if (currentProjectDir) {
            handleCloseProject();
          }
          return;
        case 'show-project-in-folder':
          if (currentProjectDir) {
            window.electronAPI.showItemInFolder(currentProjectDir);
          }
          return;
        case 'undo':
          if (page === 'editor' && canUndo) {
            undo();
          }
          return;
        case 'redo':
          if (page === 'editor' && canRedo) {
            redo();
          }
          return;
        case 'replace-audio':
          if (page === 'editor') {
            await handleReplaceAudio();
          }
          return;
        case 'replace-srt':
          if (page === 'editor') {
            await handleReplaceSrt();
          }
          return;
        case 'add-asset':
          if (page === 'editor') {
            await handleAddAsset();
          }
          return;
        case 'export':
          if (page === 'editor') {
            setExportRequestToken((current) => current + 1);
          }
          return;
        case 'save-script': {
          const saveCb = useScriptStore.getState().workbenchCallbacks.save;
          if (page === 'script-workbench' && saveCb) {
            saveCb();
          }
          return;
        }
        case 'go-back':
          if (page === 'script-workbench') {
            setPage('welcome');
          }
          return;
        case 'find': {
          const findCb = useScriptStore.getState().workbenchCallbacks.find;
          if (page === 'script-workbench' && findCb) findCb();
          return;
        }
        case 'find-replace': {
          const findReplaceCb = useScriptStore.getState().workbenchCallbacks.findReplace;
          if (page === 'script-workbench' && findReplaceCb) findReplaceCb();
          return;
        }
      }
    },
    [
      canRedo,
      canUndo,
      currentProjectDir,
      handleAddAsset,
      handleCloseProject,
      handleNewProject,
      handleOpenProject,
      handleOpenSettings,
      handleReplaceAudio,
      handleReplaceSrt,
      page,
      redo,
      undo,
    ],
  );

  const handleMenuEvent = useCallback(
    async (event: MenuEvent) => {
      if (event.type === 'open-recent-project') {
        await openProject(event.projectDir);
        return;
      }

      await handleCommand(event.action);
    },
    [handleCommand, openProject],
  );

  useEffect(() => {
    const unsubscribe = window.electronAPI.onMenuAction((event) => {
      void handleMenuEvent(event);
    });

    return unsubscribe;
  }, [handleMenuEvent]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd+Shift+A 切换 Agent 侧边栏
      if (event.metaKey && event.shiftKey && event.key === 'a') {
        event.preventDefault();
        useAgentStore.getState().toggleSidebar();
        return;
      }

      if (isTextEditingTarget(event.target)) {
        return;
      }

      const scopedCommand = getAppShortcutCommand({
        hasProject: Boolean(currentProjectDir),
        ...event,
      });
      if (!scopedCommand) {
        return;
      }

      event.preventDefault();
      void handleCommand(scopedCommand);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentProjectDir, handleCommand]);

  const handleSetupComplete = async (audioPath: string, srtPath: string) => {
    setIsSettingUp(true);
    setSetupError(null);

    try {
      let projectDir = getCurrentProjectDir();
      if (!projectDir) {
        projectDir = (await window.electronAPI.selectProjectDirectory()) || '';
        if (!projectDir) {
          return;
        }

        setProjectDir(projectDir);
        void syncWorkspaceState();
      }

      setTimeline(createDefaultTimeline());
      const { entries, durationMs } = await window.electronAPI.parseSrtFile(srtPath);
      setSrtEntries(entries);
      setPodcast(audioPath, srtPath, durationMs);
      setPage('editor');
    } catch (error) {
      console.error('初始化工程失败:', error);
      setSetupError('初始化工程失败，请确认 SRT 文件格式正确。');
    } finally {
      setIsSettingUp(false);
    }
  };

  // ── 双向同步：ScriptWorkbench ↔ Editor 共享工作目录 ──

  // 方向 A：script store 选定新目录 → 更新 timeline store + App 状态
  useEffect(() => {
    const unsub = useScriptStore.subscribe((state, prev) => {
      if (state.projectDir && state.projectDir !== prev.projectDir) {
        if (state.projectDir !== getCurrentProjectDir()) {
          setProjectDir(state.projectDir);
          void syncWorkspaceState();
        }
      }
    });
    return unsub;
  }, [syncWorkspaceState]);

  // 方向 B：timeline store / App 打开新项目 → 同步到 script store
  useEffect(() => {
    if (!currentProjectDir) return;
    const scriptDir = useScriptStore.getState().projectDir;
    if (scriptDir !== currentProjectDir) {
      useScriptStore.getState().setProjectDir(currentProjectDir);
    }
  }, [currentProjectDir]);

  const handleWorkspaceTabSwitch = useCallback(
    (tab: 'script-workbench' | 'editor') => {
      if (tab === page) return;
      setPage(tab);
    },
    [page, setPage],
  );

  const showWorkspaceTabs = page === 'editor' || page === 'script-workbench';
  const reducedMotion = prefersReducedMotion();
  const pageTransition = resolvePageTransition({
    fromPage: previousPage,
    toPage: page,
    reason: pageTransitionReason,
    reducedMotion,
  });

  const agentSidebarOpen = useAgentStore((s) => s.sidebarOpen);
  const projectName = currentProjectDir ? getFileNameFromPath(currentProjectDir) : '';

  // 写稿进度：null=无稿件（隐藏圆环），50=已生成未审，100=审稿完成
  const scriptProgress = useScriptStore((s) => {
    if (!s.workspaceFiles.hasScriptFile) return null;
    const isClean =
      s.reviewState === 'clean' ||
      (s.reviewState === 'issues' && s.annotations.every((a) => a.status !== 'pending'));
    return isClean ? 100 : 50;
  });

  if (isHydrating) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr) auto',
          background: APP_LOADING_BACKGROUND,
          color: 'var(--color-text-primary)',
          fontFamily: APP_FONT_STACK,
        }}
      >
        <Toolbar
          compact={viewport.width < 960}
          page={page}
          projectName={projectName}
          saveStatus={aggregatedSaveStatus}
          canUndo={canUndo}
          canRedo={canRedo}
          onCommand={(command) => {
            void handleCommand(command);
          }}
        />
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 0 }}>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: 14,
                letterSpacing: '0.16em',
                color: 'var(--color-brand-accent)',
              }}
            >
              VIDEO WEB MASTER
            </div>
            <h1 style={{ margin: '12px 0 0', fontSize: 28 }}>正在恢复上次工程...</h1>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: APP_WINDOW_BACKGROUND,
        color: 'var(--color-text-primary)',
        overflow: 'hidden',
        fontFamily: APP_FONT_STACK,
        display: 'grid',
        gridTemplateRows: showWorkspaceTabs
          ? 'auto auto minmax(0, 1fr) auto'
          : 'auto minmax(0, 1fr) auto',
      }}
    >
      <Toolbar
        compact={viewport.width < 960}
        page={page}
        projectName={projectName}
        saveStatus={aggregatedSaveStatus}
        canUndo={canUndo}
        canRedo={canRedo}
        onCommand={(command) => {
          void handleCommand(command);
        }}
      />
      {showWorkspaceTabs && (
        <WorkspaceTabs
          active={page as 'script-workbench' | 'editor'}
          onSwitch={handleWorkspaceTabSwitch}
          scriptProgress={scriptProgress}
        />
      )}
      <div style={{ minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative' }}>
          {/* LayoutGroup 让 setup → editor 的 layoutId 共享元素(Hero ② audio thumb)能跨 AnimatePresence morph */}
          <LayoutGroup id="page-shared-elements">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={pageTransition.contentKey}
              initial={pageTransition.initial}
              animate={pageTransition.animate}
              exit={pageTransition.exit}
              transition={pageTransition.transition}
              style={{ height: '100%', minHeight: 0 }}
            >
              {page === 'welcome' || page === 'setup' ? (
                <Setup
                  busy={isSettingUp}
                  errorMessage={setupError}
                  projectName={projectName}
                  recentProjects={recentProjects}
                  onComplete={handleSetupComplete}
                  onOpenRecentProject={openProject}
                  onRemoveRecentProject={handleRemoveRecentProject}
                  onImportScript={handleImportScript}
                  onOpenSettings={() => setPage('settings')}
                  onDouyinImport={handleDouyinImport}
                  onImportProject={handleOpenImportProject}
                />
              ) : page === 'settings' ? (
                <Settings onBack={() => setPage(previousPage)} />
              ) : page === 'auto-run' ? (
                <AutoRunController setPage={setPage} />
              ) : (
                <>
                  {/* 写稿工作台和编辑器保持同时挂载，用 display 切换，避免重新挂载引起的布局振荡 */}
                  <div style={{ display: page === 'script-workbench' ? 'contents' : 'none' }}>
                    <ScriptWorkbench
                      onBack={() => setPage('welcome')}
                      onNavigateToEditor={() => setPage('editor')}
                    />
                  </div>
                  <div style={{ display: page === 'editor' ? 'contents' : 'none' }}>
                    <Editor
                      onAddAsset={handleAddAsset}
                      onOpenSettings={handleOpenSettings}
                      onUseAsPodcastAudio={handleUseAssetAsPodcastAudio}
                      onUseAsPodcastSrt={handleUseAssetAsPodcastSrt}
                      exportRequestToken={exportRequestToken}
                      projectDir={currentProjectDir}
                      isActive={page === 'editor'}
                    />
                  </div>
                </>
              )}
            </m.div>
          </AnimatePresence>
          </LayoutGroup>
        </div>
        <AnimatePresence initial={false}>
          {agentSidebarOpen && <AgentSidebar />}
        </AnimatePresence>
      </div>
      <AppStatusBar />
      <ImportProjectDialog
        open={importProjectDialogOpen}
        onOpenChange={setImportProjectDialogOpen}
        onImported={handleImportProjectComplete}
      />
    </div>
  );
}
