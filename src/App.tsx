import { useCallback, useEffect, useState } from 'react';
import { Toolbar } from './components/Toolbar';
import type { MenuAction } from './lib/electron-api';
import { parsePersistedAIState } from './lib/ai-persistence';
import { useViewportSize } from './hooks/useViewportSize';
import { getAppShortcutCommand, isTextEditingTarget } from './lib/native-shortcuts';
import { Editor } from './pages/Editor';
import { Setup } from './pages/Setup';
import { getFileNameFromPath } from './lib/utils';
import { createDefaultTimeline, type TimelineData } from './types';
import { useAIStore } from './store/ai';
import {
  clearCurrentProject,
  getCurrentProjectDir,
  getCurrentSaveStatus,
  removeRecentProject,
  setProjectDir,
  subscribeToSaveStatus,
  useTimelineStore,
} from './store/timeline';

type Page = 'setup' | 'editor';

const APP_FONT_STACK =
  '"SF Pro Text", "SF Pro Display", "PingFang SC", -apple-system, BlinkMacSystemFont, sans-serif';
const APP_LOADING_BACKGROUND = 'var(--color-window-bg)';
const APP_WINDOW_BACKGROUND = 'var(--color-window-bg)';

export default function App() {
  const viewport = useViewportSize();
  const [page, setPage] = useState<Page>('setup');
  const [isHydrating, setIsHydrating] = useState(true);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [currentProjectDir, setCurrentProjectDir] = useState(() => getCurrentProjectDir());
  const [saveStatus, setSaveStatus] = useState(() => getCurrentSaveStatus());
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
  const setCoverCandidates = useAIStore((state) => state.setCoverCandidates);

  const syncWorkspaceState = useCallback(() => {
    setCurrentProjectDir(getCurrentProjectDir());
  }, []);

  const resetToSetup = useCallback(() => {
    setTimeline(createDefaultTimeline());
    setSrtEntries([]);
    clearAIAnalysis();
    setPage('setup');
  }, [clearAIAnalysis, setSrtEntries, setTimeline]);

  const openProject = useCallback(
    async (projectDir: string) => {
      try {
        const storedTimeline = await window.electronAPI.loadTimeline(projectDir);
        if (!storedTimeline) {
          removeRecentProject(projectDir);
          if (getCurrentProjectDir() === projectDir) {
            clearCurrentProject();
          }
          syncWorkspaceState();
          resetToSetup();
          setSetupError('打开工程失败，请确认目录里存在有效的 timeline.json。');
          return;
        }

        const parsedTimeline = JSON.parse(storedTimeline) as TimelineData;
        setTimeline(parsedTimeline);

        if (parsedTimeline.podcast?.srtPath) {
          const { entries } = await window.electronAPI.parseSrtFile(parsedTimeline.podcast.srtPath);
          setSrtEntries(entries);
        } else {
          setSrtEntries([]);
        }

        const storedAIAnalysis = await window.electronAPI.loadAIAnalysis(projectDir);
        if (storedAIAnalysis) {
          try {
            const persistedState = parsePersistedAIState(JSON.parse(storedAIAnalysis));
            if (persistedState?.analysisResult) {
              setAIAnalysisResult(persistedState.analysisResult);
              setCoverCandidates(persistedState.coverCandidates);
            } else {
              clearAIAnalysis();
            }
          } catch {
            clearAIAnalysis();
          }
        } else {
          clearAIAnalysis();
        }

        setProjectDir(projectDir);
        syncWorkspaceState();
        setSetupError(null);
        setPage(
          parsedTimeline.podcast?.audioPath && parsedTimeline.podcast?.srtPath ? 'editor' : 'setup',
        );
      } catch (error) {
        console.error('恢复工程失败:', error);
        removeRecentProject(projectDir);
        if (getCurrentProjectDir() === projectDir) {
          clearCurrentProject();
        }
        syncWorkspaceState();
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
      setTimeline,
      syncWorkspaceState,
    ],
  );

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

  const handleNewProject = useCallback(async () => {
    const projectDir = await window.electronAPI.selectProjectDirectory();
    if (!projectDir) {
      return;
    }

    setProjectDir(projectDir);
    syncWorkspaceState();
    resetToSetup();
    setSetupError(null);
  }, [resetToSetup, syncWorkspaceState]);

  const handleOpenProject = useCallback(async () => {
    const projectDir = await window.electronAPI.selectProjectDirectory();
    if (!projectDir) {
      return;
    }

    await openProject(projectDir);
  }, [openProject]);

  const handleCloseProject = useCallback(() => {
    clearCurrentProject();
    syncWorkspaceState();
    resetToSetup();
    setSetupError(null);
  }, [resetToSetup, syncWorkspaceState]);

  const handleAddAsset = useCallback(async () => {
    const asset = await window.electronAPI.addAsset();
    if (!asset) {
      return;
    }

    addAsset(asset.path, asset.type, asset.durationMs);
  }, [addAsset]);

  const handleReplaceAudio = useCallback(async () => {
    const audioPath = await window.electronAPI.selectMediaFile('audio');
    if (!audioPath) {
      return;
    }

    setPodcast(audioPath, timeline.podcast.srtPath, timeline.podcast.durationMs);
  }, [setPodcast, timeline.podcast.durationMs, timeline.podcast.srtPath]);

  const handleReplaceSrt = useCallback(async () => {
    const srtPath = await window.electronAPI.selectMediaFile('srt');
    if (!srtPath) {
      return;
    }

    const { entries, durationMs } = await window.electronAPI.parseSrtFile(srtPath);
    setSrtEntries(entries);
    setPodcast(timeline.podcast.audioPath, srtPath, durationMs);
  }, [setPodcast, setSrtEntries, timeline.podcast.audioPath]);

  const handleCommand = useCallback(
    async (command: MenuAction) => {
      switch (command) {
        case 'new-project':
          await handleNewProject();
          return;
        case 'open-project':
          await handleOpenProject();
          return;
        case 'close-project':
          if (page === 'editor') {
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
      handleReplaceAudio,
      handleReplaceSrt,
      page,
      redo,
      undo,
    ],
  );

  useEffect(() => {
    const unsubscribe = window.electronAPI.onMenuAction((action) => {
      void handleCommand(action);
    });

    return unsubscribe;
  }, [handleCommand]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextEditingTarget(event.target)) {
        return;
      }

      const command = getAppShortcutCommand(event);
      if (!command) {
        return;
      }

      event.preventDefault();
      void handleCommand(command);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCommand]);

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
        syncWorkspaceState();
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

  const projectName = currentProjectDir ? getFileNameFromPath(currentProjectDir) : '';

  if (isHydrating) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr)',
          background: APP_LOADING_BACKGROUND,
          color: 'var(--color-text-primary)',
          fontFamily: APP_FONT_STACK,
        }}
      >
        <Toolbar
          compact={viewport.width < 960}
          page="setup"
          projectName={projectName}
          saveStatus={saveStatus}
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
        gridTemplateRows: 'auto minmax(0, 1fr)',
      }}
    >
      <Toolbar
        compact={viewport.width < 960}
        page={page}
        projectName={projectName}
        saveStatus={saveStatus}
        onCommand={(command) => {
          void handleCommand(command);
        }}
      />
      <div style={{ minHeight: 0 }}>
        {page === 'setup' ? (
          <Setup
            busy={isSettingUp}
            errorMessage={setupError}
            onComplete={handleSetupComplete}
          />
        ) : (
          <Editor onAddAsset={handleAddAsset} exportRequestToken={exportRequestToken} />
        )}
      </div>
    </div>
  );
}
