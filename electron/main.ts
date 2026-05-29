import chokidar from 'chokidar';
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from 'electron';
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { FSWatcher } from 'chokidar';
import type { MenuContext, MenuEvent, ProjectMetadata } from '../src/lib/electron-api';
import { addAppLog, configureAppLogger, getAppLogFilePath, getAppLogs } from './app-logger';
import {
  analyzeSrt,
  generateCardForSegment,
  generateSingleCardFromSubtitles,
  materializeImageCard,
  regenerateAICard,
  regenerateCoverPrompt,
  type SubtitleCardDraftInput,
} from '../src/lib/ai-analysis';
import type { ExportConfig } from '../src/lib/export-settings';
import { generateCoverCandidates } from '../src/lib/cover-generation';
import {
  appendProjectStylePrompt,
  getProjectStylePromptFromTemplate,
} from '../src/lib/project-style-prompt';
import { resolvePromptBinding } from '../src/lib/llm/binding-resolver';
import {
  handleGenerateCardImage,
  handleGenerateCardVideo,
  type GenerateCardImageArgs,
  type GenerateCardVideoArgs,
} from './card-media-handlers';
import { createHyperframesComposition } from '../src/hyperframes/composition';
import { prepareTimelineForHyperframes, type HyperframesAssetDescriptor } from '../src/hyperframes/assets';
import { subtitleJsonToSRT } from '../src/lib/minimax-tts';
import { buildEstimatedSrtTextFromText } from '../src/lib/srt-resegment';
import { runTTSProvider } from './tts-provider-runner';
import { groupSentencesByBudget, buildSrtFromChunks, MIMO_TTS_CHUNK_CHAR_BUDGET, type ChunkPart } from './tts-chunking';
import { concatWavFiles } from './media-concat';
import {
  buildLegacyMinimaxTTSProvider,
  buildLegacyMinimaxTTSVoice,
} from '../src/lib/tts-settings';
import { parseSrt } from '../src/lib/srt-parser';
import type { SrtEntry, TimelineData } from '../src/types';
import type {
  AICard,
  AISegment,
  AISegmentVisualType,
  AISettings,
  ImageAspectRatio,
  PromptBindingMap,
  TTSProvider,
  TTSVoicePreset,
} from '../src/types/ai';
import { createApplicationMenuTemplate } from './app-menu';
import {
  loadRuntimeDebugConfigSync,
  resolveAppConfig,
  saveRuntimeDebugConfig,
  type ResolvedAppConfig,
} from './app-config';
import { toRendererConsoleLog } from './console-message';
import { resolveDebugRuntimeState, shouldAutoOpenDevTools } from './debug-runtime';
import {
  readAudioDurationMs,
  readVideoDurationMs,
} from './media-duration';
import { resolveHyperframesCliPath } from './hyperframes-cli';
import { runCurrentHyperframesRuntimePreflight } from './hyperframes-runtime-preflight';
import {
  buildPathWithRuntimeBinaries,
  resolveFfmpegPath,
  resolveFfprobePath,
  resolveGsapPath,
} from './runtime-binaries';
import { registerAgentIpc } from './acp/ipc';
import { HeadlessAcpProvider, type HeadlessAcpProviderEvent } from './acp/headless-provider';
import { registerConversationIpc } from './conversations/ipc';
import { registerMcpIpc } from './mcp/ipc';
import { registerScriptHistoryIpc } from './script-history/ipc';
import {
  appendAutoRunEvent,
  getAutoRunLogDir,
  getLatestRunId,
  listRecentRuns,
  readRunEvents,
  type AutoRunEvent,
} from './telemetry/auto-run-logger';
import { startMcpServer, stopMcpServer } from './mcp/server';
import { loadProjectFile, saveProjectSection } from './project-file';
import {
  scanProjectDirectory,
  importProject,
  ImportProjectError,
} from './project-import';
import type { ImportProjectArgs } from '../src/lib/project-import-types';
import { saveCoverEdit } from './cover-editor-io';
import { listSystemFonts } from './system-fonts';
import {
  loadGlobalSettings,
  loadGlobalSettingsSync,
  saveGlobalSettings,
  type GlobalSettingsFile,
} from './global-settings';
import { setClaudeCodeAcpRuntime } from '../src/lib/llm/claude-code-acp-model';
import { resolveWindowCloseAction } from './window-close';
import {
  collectBackup,
  validateBackup,
  backupCurrent,
  applyBackup,
  defaultExportFileName,
  ConfigBackupValidationError,
} from './config-backup';
import {
  readPromptUserText,
  writePromptUserText,
  deletePromptYaml,
  listPromptOverview,
  loadEffectivePromptTemplate,
} from './prompts-io';
import {
  readPromptBindings,
  writePromptBindings,
} from './prompt-bindings-io';
import {
  assertPromptCategory,
  deleteUserPromptEntry,
  getUserPromptSeed,
  listUserPromptEntries,
  migrateLegacyScriptTemplates,
  readUserPromptEntry,
  writeUserPromptEntry,
} from './user-prompts-io';
import {
  PROMPT_CATEGORY_META,
  PROMPT_KIND_META,
  PROMPT_KINDS,
  getBuiltinPromptTemplate,
  isPromptKind,
  type PromptKind,
  type PromptScope,
} from '../src/lib/prompts';
import {
  loadRecentProjects,
  addRecentProject,
  removeRecentProject as removeRecentProjectFromStore,
  refreshRecentProjects,
  type RecentProjectEntry,
} from './recent-projects';
import { getVideoImportService } from './video-import/import-service';
import { resolveDouyinVideoSource } from './video-import/douyin-downloader';
import type { VideoImportRequest } from '../src/lib/video-import-types';
import { createWorkbenchTabContextMenuTemplate } from './workbench-tab-context-menu';
import { getWindowChromeOptions } from './window-chrome';
import { getPipelineService, attachTaskProgressBridge } from './pipeline';
import { setActiveProjectPath } from './pipeline/context';

const execFileAsync = promisify(execFile);

const AGENT_CONFIG_PATH = path.join(os.homedir(), '.lingji', 'agent-config.json');
const headlessAcpRuntimeListeners: Array<(payload: {
  requestId: string;
  event: HeadlessAcpProviderEvent;
}) => void> = [];

const headlessAcpProvider = new HeadlessAcpProvider({
  eventSink: (requestId: string, event: HeadlessAcpProviderEvent) => {
    mainWindow?.webContents.send('llm:claude-code-acp-event', { requestId, event });
    for (const listener of headlessAcpRuntimeListeners) {
      listener({ requestId, event });
    }
  },
});

setClaudeCodeAcpRuntime({
  runClaudeCodeAcpLLM: (args) => headlessAcpProvider.runPrompt(args),
  cancelClaudeCodeAcpLLM: (requestId) => headlessAcpProvider.cancel(requestId),
  onClaudeCodeAcpLLMEvent: (callback) => {
    headlessAcpRuntimeListeners.push(callback);
    return () => {
      const idx = headlessAcpRuntimeListeners.indexOf(callback);
      if (idx >= 0) headlessAcpRuntimeListeners.splice(idx, 1);
    };
  },
});

function resolveAppIconPath(): string | null {
  const candidates = [
    path.join(__dirname, '../build/icon.png'),
    path.resolve(app.getAppPath(), 'build/icon.png'),
    path.resolve(process.cwd(), 'build/icon.png'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

let mainWindow: BrowserWindow | null = null;
let menuContext: MenuContext = {
  activePage: 'welcome',
  hasProject: false,
  recentProjects: [],
  isAutoRunning: false,
};
let fileWatcher: FSWatcher | null = null;
const activeTtsRequests = new Map<string, AbortController>();
let isAppQuitting = false;
const videoImportService = getVideoImportService();
let appConfig: ResolvedAppConfig | null = null;

function sendMenuEvent(event: MenuEvent) {
  mainWindow?.webContents.send('menu-action', event);
}

function writeAppLog(level: 'info' | 'warn' | 'error', scope: string, message: string, details?: string) {
  const entry = addAppLog(level, scope, message, details);
  if (entry) {
    mainWindow?.webContents.send('app-log', entry);
  }
}

function getCurrentAppConfig(): ResolvedAppConfig {
  if (appConfig) {
    return appConfig;
  }

  appConfig = resolveAppConfig({
    userDataPath: app.getPath('userData'),
    env: {
      MAIN_VITE_DEBUG_MODE: import.meta.env.MAIN_VITE_DEBUG_MODE,
      MAIN_VITE_LOG_LEVEL: import.meta.env.MAIN_VITE_LOG_LEVEL,
    },
  });
  return appConfig;
}

function refreshAppConfig(): ResolvedAppConfig {
  const nextConfig = resolveAppConfig({
    userDataPath: app.getPath('userData'),
    env: {
      MAIN_VITE_DEBUG_MODE: import.meta.env.MAIN_VITE_DEBUG_MODE,
      MAIN_VITE_LOG_LEVEL: import.meta.env.MAIN_VITE_LOG_LEVEL,
    },
    runtimeConfig: loadRuntimeDebugConfigSync(app.getPath('userData')),
  });
  appConfig = nextConfig;
  configureAppLogger({
    logDirPath: nextConfig.logDirPath,
    logLevel: nextConfig.logLevel,
  });
  return nextConfig;
}

async function openLogDirectory(): Promise<void> {
  const currentConfig = getCurrentAppConfig();
  await fs.mkdir(currentConfig.logDirPath, { recursive: true });
  const result = await shell.openPath(currentConfig.logDirPath);
  if (result) {
    writeAppLog('warn', 'log', '打开日志目录失败', result);
  }
}

async function exportLogsArchive(): Promise<void> {
  const currentConfig = getCurrentAppConfig();
  await fs.mkdir(currentConfig.logDirPath, { recursive: true });

  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, {
        title: '导出日志 ZIP',
        defaultPath: path.join(currentConfig.logDirPath, `video-web-master-logs-${Date.now()}.zip`),
        filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }],
      })
    : await dialog.showSaveDialog({
        title: '导出日志 ZIP',
        defaultPath: path.join(currentConfig.logDirPath, `video-web-master-logs-${Date.now()}.zip`),
        filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }],
      });

  if (result.canceled || !result.filePath) {
    return;
  }

  const files = (await fs.readdir(currentConfig.logDirPath))
    .filter((fileName) => /^app-\d{4}-\d{2}-\d{2}\.log$/.test(fileName))
    .sort();

  if (files.length === 0) {
    await fs.writeFile(result.filePath, '');
    writeAppLog('warn', 'log', '日志目录为空，已导出空归档', result.filePath);
    return;
  }

  const tmpZipDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-web-master-log-export-'));
  try {
    await Promise.all(
      files.map(async (fileName) => {
        await fs.copyFile(
          path.join(currentConfig.logDirPath, fileName),
          path.join(tmpZipDir, fileName),
        );
      }),
    );
    await execFileAsync('zip', ['-r', result.filePath, '.'], {
      cwd: tmpZipDir,
    });
    writeAppLog('info', 'log', '日志归档已导出', result.filePath);
  } finally {
    await fs.rm(tmpZipDir, { recursive: true, force: true });
  }
}

async function toggleRuntimeDebugMode(): Promise<void> {
  const userDataPath = app.getPath('userData');
  const currentRuntimeConfig = loadRuntimeDebugConfigSync(userDataPath);
  const currentConfig = getCurrentAppConfig();
  const nextDebugMode = !(currentRuntimeConfig?.debugMode ?? currentConfig.debugMode);

  await saveRuntimeDebugConfig(userDataPath, {
    debugMode: nextDebugMode,
    logLevel: currentRuntimeConfig?.logLevel ?? currentConfig.logLevel,
  });

  const nextConfig = refreshAppConfig();
  refreshApplicationMenu();

  const { response } = mainWindow
    ? await dialog.showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['稍后手动重启', '立即重启'],
        defaultId: 1,
        cancelId: 0,
        title: '调试模式已更新',
        message: nextDebugMode ? '调试模式已启用。' : '调试模式已关闭。',
        detail: `新的配置会在应用重启后生效。\n日志级别：${nextConfig.logLevel}\n日志文件：${nextConfig.logFilePath}`,
      })
    : await dialog.showMessageBox({
        type: 'info',
        buttons: ['稍后手动重启', '立即重启'],
        defaultId: 1,
        cancelId: 0,
        title: '调试模式已更新',
        message: nextDebugMode ? '调试模式已启用。' : '调试模式已关闭。',
        detail: `新的配置会在应用重启后生效。\n日志级别：${nextConfig.logLevel}\n日志文件：${nextConfig.logFilePath}`,
      });

  if (response === 1) {
    app.relaunch();
    app.quit();
  }
}

function createApplicationMenu() {
  const currentConfig = getCurrentAppConfig();
  const runtimeState = resolveDebugRuntimeState({
    isPackaged: app.isPackaged,
    debugMode: currentConfig.debugMode,
  });
  return Menu.buildFromTemplate(
    createApplicationMenuTemplate(sendMenuEvent, {
      ...menuContext,
      isDevelopment: runtimeState.isDevelopment,
      debugMode: currentConfig.debugMode,
    }, {
      onToggleDebugMode: () => {
        void toggleRuntimeDebugMode();
      },
      onOpenLogDirectory: () => {
        void openLogDirectory();
      },
      onExportLogs: () => {
        void exportLogsArchive();
      },
    }),
  );
}

function refreshApplicationMenu() {
  Menu.setApplicationMenu(createApplicationMenu());
}

function resolveRuntimeBinaries() {
  const options = {
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    cwd: process.cwd(),
    moduleDir: __dirname,
    existsSync,
  };
  return {
    ffmpegPath: resolveFfmpegPath(options),
    ffprobePath: resolveFfprobePath(options),
    gsapPath: resolveGsapPath(options),
  };
}

function createWindow() {
  const currentConfig = getCurrentAppConfig();
  const runtimeState = resolveDebugRuntimeState({
    isPackaged: app.isPackaged,
    debugMode: currentConfig.debugMode,
  });
  const appIconPath = resolveAppIconPath();
  const windowChromeOptions = getWindowChromeOptions(process.platform);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: '#070b14',
    title: '灵机剪影',
    ...(appIconPath ? { icon: appIconPath } : {}),
    ...windowChromeOptions,
    webPreferences: {
      devTools: runtimeState.allowDevTools,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // 允许 file:// 加载本地媒体
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.on('console-message', (details) => {
    const logEntry = toRendererConsoleLog(details);
    writeAppLog(logEntry.level, logEntry.scope, logEntry.message, logEntry.details);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    writeAppLog('error', 'window', `页面加载失败（${errorCode}）`, errorDescription);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeAppLog('error', 'window', `渲染进程退出：${details.reason}`, String(details.exitCode));
  });

  mainWindow.on('close', (event) => {
    const action = resolveWindowCloseAction({
      hasProject: menuContext.hasProject,
      isAppQuitting,
    });

    if (action !== 'close-project') {
      return;
    }

    event.preventDefault();
    sendMenuEvent({
      type: 'command',
      action: 'close-project',
    });
  });

  // 确保标题设置正确
  mainWindow.setTitle('灵机剪影');

  if (shouldAutoOpenDevTools({ isPackaged: app.isPackaged, debugMode: currentConfig.debugMode })) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  refreshApplicationMenu();
  writeAppLog('info', 'app', '主窗口已创建');
}

async function materializeRenderAssets(
  publicDir: string,
  assets: HyperframesAssetDescriptor[],
): Promise<void> {
  await Promise.all(
    assets.map(async (asset) => {
      const targetPath = path.join(publicDir, asset.publicPath);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });

      try {
        await fs.link(asset.sourcePath, targetPath);
      } catch {
        await fs.copyFile(asset.sourcePath, targetPath);
      }
    }),
  );
}

/**
 * 从 timeline 反推项目目录：podcast-audio.mp3 / podcast-subtitles.srt 都
 * 位于 projectDir 根，用 audioPath 的 dirname 即得（项目硬约定）。
 * 用于把 ai-card MediaCardContent 的相对路径解析为绝对，再做 public 映射。
 */
function inferProjectDirFromTimeline(timeline: TimelineData): string | null {
  const audio = timeline.podcast?.audioPath;
  if (audio && path.isAbsolute(audio)) return path.dirname(audio);
  const srt = timeline.podcast?.srtPath;
  if (srt && path.isAbsolute(srt)) return path.dirname(srt);
  return null;
}

async function createRenderPublicDir(
  timeline: TimelineData,
): Promise<{ timeline: TimelineData; publicDir: string }> {
  const projectDir = inferProjectDirFromTimeline(timeline);
  const { timeline: renderTimeline, assets } = prepareTimelineForHyperframes(
    timeline,
    projectDir,
  );
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lingjijianying-public-'));
  await materializeRenderAssets(publicDir, assets);

  return {
    timeline: renderTimeline,
    publicDir,
  };
}

interface PreparedHyperframesProject {
  timeline: TimelineData;
  projectDir: string;
  cleanup: () => Promise<void>;
}

async function prepareHyperframesProject(
  timeline: TimelineData,
  srtEntries: SrtEntry[],
): Promise<PreparedHyperframesProject> {
  const { timeline: renderTimeline, publicDir } = await createRenderPublicDir(timeline);
  const gsapSourcePath = resolveRuntimeBinaries().gsapPath;
  if (!gsapSourcePath) {
    throw new Error('未找到 GSAP runtime，请确认 gsap 已安装并随应用打包');
  }
  await fs.copyFile(gsapSourcePath, path.join(publicDir, 'gsap.min.js'));
  const composition = createHyperframesComposition({
    timeline: renderTimeline,
    srtEntries,
    projectDir: inferProjectDirFromTimeline(timeline),
    gsapSrc: './gsap.min.js',
  });
  await fs.writeFile(path.join(publicDir, 'index.html'), composition.html, 'utf-8');

  return {
    timeline: renderTimeline,
    projectDir: publicDir,
    cleanup: async () => {
      await fs.rm(publicDir, { recursive: true, force: true });
    },
  };
}

async function getDirectorySizeBytes(directoryPath: string): Promise<number> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isSymbolicLink()) {
        return 0;
      }

      if (entry.isDirectory()) {
        return getDirectorySizeBytes(entryPath);
      }

      if (entry.isFile()) {
        const stats = await fs.stat(entryPath);
        return stats.size;
      }

      return 0;
    }),
  );

  return sizes.reduce((total, size) => total + size, 0);
}

async function readProjectMetadata(projectDir: string): Promise<ProjectMetadata> {
  const stats = await fs.stat(projectDir);
  const createdAtMs = Math.round(stats.birthtimeMs || stats.ctimeMs || stats.mtimeMs || Date.now());
  const sizeBytes = await getDirectorySizeBytes(projectDir);

  return {
    projectDir,
    sizeBytes,
    createdAtMs,
  };
}

ipcMain.handle('parse-srt-file', async (_event, filePath: string) => {
  const content = await fs.readFile(filePath, 'utf-8');
  const entries = parseSrt(content);
  const durationMs = entries.length > 0 ? entries[entries.length - 1].endMs : 0;

  return { entries, durationMs };
});

ipcMain.handle('get-audio-duration', async (_event, filePath: string) => {
  return readAudioDurationMs(filePath, { ffprobePath: resolveRuntimeBinaries().ffprobePath });
});

ipcMain.handle('hyperframes-runtime-preflight', async () =>
  runCurrentHyperframesRuntimePreflight({
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    cwd: process.cwd(),
    moduleDir: __dirname,
  }),
);

ipcMain.handle('get-file-mtime', async (_event, filePath: string) => {
  if (!filePath) return null;
  try {
    const stat = await fs.stat(filePath);
    return Math.round(stat.mtimeMs);
  } catch {
    return null;
  }
});

// ─────────────────────────────────────────────────────────────
// 一键成稿 / AI 流水线观测日志：renderer 写事件 + 读取近期运行
// 日志落盘 <userData>/logs/auto-run/<runId>.jsonl
// ─────────────────────────────────────────────────────────────
ipcMain.handle(
  'auto-run-telemetry/append',
  async (_event, event: AutoRunEvent) => {
    if (!event || typeof event.runId !== 'string' || typeof event.kind !== 'string') {
      return;
    }
    // ts 缺省补当前时间，方便 renderer 端少写一个字段
    const normalized: AutoRunEvent = {
      ...event,
      ts: typeof event.ts === 'number' && Number.isFinite(event.ts) ? event.ts : Date.now(),
    };
    await appendAutoRunEvent(normalized);
  },
);

ipcMain.handle('auto-run-telemetry/list-recent', async (_event, limit?: number) => {
  return listRecentRuns(typeof limit === 'number' ? limit : 20);
});

ipcMain.handle('auto-run-telemetry/read-run', async (_event, runId: string) => {
  return readRunEvents(runId);
});

ipcMain.handle('auto-run-telemetry/get-latest', async () => {
  const runId = await getLatestRunId();
  if (!runId) return null;
  return { runId, events: await readRunEvents(runId) };
});

ipcMain.handle('auto-run-telemetry/get-log-dir', async () => getAutoRunLogDir());

/**
 * 把"主进程内部的耗时事件"统一以 runId 上报到 jsonl 日志。
 * 调用方（analyze-srt / generate-cover-images / generate-tts 等 IPC handler）拿到
 * renderer 传过来的 telemetryRunId 后，调用 makeMainTelemetry(runId) 即可得到一个
 * 满足 TelemetryHook 接口的钩子，再传给 lib 层的 analyzeSrt / generateSubtitleHighlights。
 * runId 为空 / 不传则得到 no-op，业务路径完全保持原样。
 */
function makeMainTelemetry(runId?: string | null): { emit: (kind: string, extra?: Record<string, unknown>) => void } {
  if (!runId || typeof runId !== 'string' || !runId.trim()) {
    return { emit: () => undefined };
  }
  const id = runId.trim();
  return {
    emit: (kind, extra = {}) => {
      void appendAutoRunEvent({ runId: id, ts: Date.now(), kind, ...extra }).catch(() => undefined);
    },
  };
}

ipcMain.handle(
  'analyze-srt',
  async (
    _event,
    args: {
      entries?: SrtEntry[];
      srtContent?: string;
      settings: AISettings;
      globalPrompt?: string;
      projectDir?: string;
      projectBindings?: PromptBindingMap | null;
      /** 一键流水线传过来的运行 ID；用于把内部耗时事件写进 auto-run jsonl */
      telemetryRunId?: string | null;
    },
  ) => {
    writeAppLog(
      'info',
      'ai-analysis',
      '收到字幕分析请求',
      `entries=${args.entries?.length ?? 0}, hasSrtContent=${Boolean(args.srtContent)}`,
    );
    const entries = Array.isArray(args.entries) && args.entries.length > 0
      ? args.entries
      : parseSrt(args.srtContent ?? '');
    try {
      const userDataPath = app.getPath('userData');
      const planningTemplate = await loadEffectivePromptTemplate('planning.segment', {
        userDataPath,
        projectDir: args.projectDir,
      });
      const cardTemplate = await loadEffectivePromptTemplate('cards.segment', {
        userDataPath,
        projectDir: args.projectDir,
      });
      const imageTemplate = await loadEffectivePromptTemplate('card.image', {
        userDataPath,
        projectDir: args.projectDir,
      });
      const coverTemplate = await loadEffectivePromptTemplate('cover.regeneration', {
        userDataPath,
        projectDir: args.projectDir,
      });
      const projectStyleTemplate = await loadEffectivePromptTemplate('project.style', {
        userDataPath,
        projectDir: args.projectDir,
      });
      const projectStylePrompt = getProjectStylePromptFromTemplate(projectStyleTemplate);
      // 仅当 renderer 提供了 projectDir 时，才把 image 卡片物化能力注入；
      // 否则 LLM 仍可吐出 image 类型 prompt，但保留 generationStatus='pending'，
      // 用户后续可在 Inspector 手动触发 generate-card-image 完成。
      const generateCardImage = args.projectDir
        ? async (invoke: {
            cardId: string;
            prompt: string;
            aspectRatio: ImageAspectRatio;
            segmentId: string;
          }) => {
            return handleGenerateCardImage(
              {
                projectDir: args.projectDir!,
                cardId: invoke.cardId,
                prompt: invoke.prompt,
                aspectRatio: invoke.aspectRatio,
              },
              {
                settings: args.settings,
                projectBindings: args.projectBindings ?? null,
                projectStylePrompt,
                onProgress: () => {
                  // analyze-srt 主进度由 onProgress 已覆盖；图像生成内部进度暂不上报
                },
              },
            );
          }
        : undefined;
      const telemetry = makeMainTelemetry(args.telemetryRunId);
      const result = await analyzeSrt(entries, args.settings, {
        globalPrompt: args.globalPrompt,
        projectStylePrompt,
        planningTemplate,
        cardTemplate,
        imageTemplate,
        coverTemplate,
        projectBindings: args.projectBindings ?? null,
        generateCardImage,
        onProgress: (progress) => {
          mainWindow?.webContents.send('analyze-progress', progress);
        },
        telemetry,
        // 规划完成后立刻把 segments / summary 等回吐给 renderer，
        // 卡片生成与"独立的 cover.regeneration LLM 调用"由 lib 层并行触发。
        // 注意：这里的 coverPrompts 是 planning.segment 模板顺带的 fallback，
        // 真正的封面提示词以 'analyze-cover-prompts-ready' 事件为准。
        onPlanningDone: (planning) => {
          mainWindow?.webContents.send('analyze-planning-done', {
            segments: planning.segments,
            coverPrompts: planning.coverPrompts,
            summary: planning.summary,
            keywords: planning.keywords,
            globalPrompt: planning.globalPrompt,
          });
        },
        // 独立 cover.regeneration 调用完成（COVER_REGENERATION 视觉系统）。
        // Track C 收到此事件后才发起 generate-cover-images。
        onCoverPromptsReady: (prompts) => {
          mainWindow?.webContents.send('analyze-cover-prompts-ready', { prompts });
        },
      });
      writeAppLog(
        'info',
        'ai-analysis',
        '字幕分析完成',
        [
          `cards=${result.cards.length}, coverPrompts=${result.coverPrompts.length}`,
          result.cardErrors?.length
            ? `cardErrors=${result.cardErrors.length}; sample=${result.cardErrors
                .slice(0, 3)
                .map((item) => `${item.segmentTitle ?? item.segmentId}: ${item.message}`)
                .join(' | ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
      return result;
    } catch (error) {
      writeAppLog(
        'error',
        'ai-analysis',
        '字幕分析失败',
        error instanceof Error ? error.stack ?? error.message : String(error),
      );
      throw error;
    }
  },
);

ipcMain.handle(
  'regenerate-ai-card',
  async (
    _event,
    args: {
      entries: SrtEntry[];
      card: AICard;
      segment: AISegment;
      settings: AISettings;
      globalPrompt?: string;
      cardPrompt?: string;
      programSummary?: string;
      keywords?: string[];
      projectDir?: string;
      projectBindings?: PromptBindingMap | null;
    },
  ) => {
    writeAppLog(
      'info',
      'ai-analysis',
      '收到单卡重生成请求',
      `cardId=${args.card.id}, entries=${args.entries.length}`,
    );

    try {
      const userDataPath = app.getPath('userData');
      const cardTemplate = await loadEffectivePromptTemplate('cards.segment', {
        userDataPath,
        projectDir: args.projectDir,
      });
      const imageTemplate = await loadEffectivePromptTemplate('card.image', {
        userDataPath,
        projectDir: args.projectDir,
      });
      const projectStyleTemplate = await loadEffectivePromptTemplate('project.style', {
        userDataPath,
        projectDir: args.projectDir,
      });
      const projectStylePrompt = getProjectStylePromptFromTemplate(projectStyleTemplate);
      return await regenerateAICard(args.entries, args.card, args.segment, args.settings, {
        globalPrompt: args.globalPrompt,
        projectStylePrompt,
        cardPrompt: args.cardPrompt,
        programSummary: args.programSummary,
        keywords: args.keywords,
        cardTemplate,
        imageTemplate,
        projectBindings: args.projectBindings ?? null,
      });
    } catch (error) {
      writeAppLog(
        'error',
        'ai-analysis',
        '单卡重生成失败',
        error instanceof Error ? error.stack ?? error.message : String(error),
      );
      throw error;
    }
  },
);

ipcMain.handle(
  'generate-ai-card-for-segment',
  async (
    _event,
    args: {
      entries: SrtEntry[];
      segment: AISegment;
      settings: AISettings;
      globalPrompt?: string;
      cardPrompt?: string;
      programSummary?: string;
      keywords?: string[];
      projectDir?: string;
      projectBindings?: PromptBindingMap | null;
      segmentIndex?: number;
      totalSegments?: number;
      prevSegment?: AISegment;
      nextSegment?: AISegment;
      visualType?: AISegmentVisualType;
    },
  ) => {
    writeAppLog(
      'info',
      'ai-analysis',
      '收到失败段卡片补生成请求',
      `segmentId=${args.segment.id}, entries=${args.entries.length}`,
    );

    try {
      const userDataPath = app.getPath('userData');
      const cardTemplate = await loadEffectivePromptTemplate('cards.segment', {
        userDataPath,
        projectDir: args.projectDir,
      });
      const imageTemplate = await loadEffectivePromptTemplate('card.image', {
        userDataPath,
        projectDir: args.projectDir,
      });
      const projectStyleTemplate = await loadEffectivePromptTemplate('project.style', {
        userDataPath,
        projectDir: args.projectDir,
      });
      const projectStylePrompt = getProjectStylePromptFromTemplate(projectStyleTemplate);
      let card = await generateCardForSegment(
        args.entries,
        {
          summary: args.programSummary ?? '',
          keywords: args.keywords ?? [],
          globalPrompt: args.globalPrompt?.trim() || undefined,
        },
        args.segment,
        args.settings,
        {
          globalPrompt: args.globalPrompt,
          projectStylePrompt,
          cardPrompt: args.cardPrompt,
          cardTemplate,
          imageTemplate,
          projectBindings: args.projectBindings ?? null,
          segmentIndex: args.segmentIndex,
          totalSegments: args.totalSegments,
          prevSegment: args.prevSegment,
          nextSegment: args.nextSegment,
          visualType: args.visualType ?? 'motion',
        },
      );

      if (card.type === 'image' && args.projectDir) {
        card = await materializeImageCard(card, async (invoke) =>
          handleGenerateCardImage(
            {
              projectDir: args.projectDir!,
              cardId: invoke.cardId,
              prompt: invoke.prompt,
              aspectRatio: invoke.aspectRatio,
            },
            {
              settings: args.settings,
              projectBindings: args.projectBindings ?? null,
              projectStylePrompt,
              onProgress: (update) => {
                mainWindow?.webContents.send('card-media-progress', {
                  cardId: invoke.cardId,
                  percent: update.percent,
                  phase: update.phase,
                  message: update.message,
                  taskId: `card-media-${invoke.cardId}`,
                });
              },
            },
          ),
        );
      }

      return card;
    } catch (error) {
      writeAppLog(
        'error',
        'ai-analysis',
        '失败段卡片补生成失败',
        error instanceof Error ? error.stack ?? error.message : String(error),
      );
      throw error;
    }
  },
);

ipcMain.handle(
  'generate-card-from-subtitles',
  async (
    _event,
    args: {
      entries: SrtEntry[];
      draft: SubtitleCardDraftInput;
      settings: AISettings;
      globalPrompt?: string;
      programSummary?: string;
      keywords?: string[];
      projectDir?: string;
      projectBindings?: PromptBindingMap | null;
    },
  ) => {
    writeAppLog(
      'info',
      'ai-analysis',
      '收到字幕手选卡片生成请求',
      `entries=${args.entries.length}, type=${args.draft.type}, textLen=${args.draft.text.length}`,
    );

    try {
      const userDataPath = app.getPath('userData');
      const cardTemplate = await loadEffectivePromptTemplate('cards.segment', {
        userDataPath,
        projectDir: args.projectDir,
      });
      const imageTemplate = await loadEffectivePromptTemplate('card.image', {
        userDataPath,
        projectDir: args.projectDir,
      });
      const projectStyleTemplate = await loadEffectivePromptTemplate('project.style', {
        userDataPath,
        projectDir: args.projectDir,
      });
      const projectStylePrompt = getProjectStylePromptFromTemplate(projectStyleTemplate);
      return await generateSingleCardFromSubtitles(args.entries, args.draft, args.settings, {
        globalPrompt: args.globalPrompt,
        projectStylePrompt,
        programSummary: args.programSummary,
        keywords: args.keywords,
        cardTemplate,
        imageTemplate,
        projectBindings: args.projectBindings ?? null,
      });
    } catch (error) {
      writeAppLog(
        'error',
        'ai-analysis',
        '字幕手选卡片生成失败',
        error instanceof Error ? error.stack ?? error.message : String(error),
      );
      throw error;
    }
  },
);

ipcMain.handle(
  'regenerate-cover-prompt',
  async (
    _event,
    args: {
      entries: SrtEntry[];
      settings: AISettings;
      globalPrompt?: string;
      currentPrompt?: string;
      projectDir?: string;
      projectBindings?: PromptBindingMap | null;
    },
  ) => {
    writeAppLog(
      'info',
      'ai-analysis',
      '收到封面提示词重生成请求',
      `entries=${args.entries.length}, hasCurrentPrompt=${Boolean(args.currentPrompt)}`,
    );

    try {
      const userDataPath = app.getPath('userData');
      const coverTemplate = await loadEffectivePromptTemplate('cover.regeneration', {
        userDataPath,
        projectDir: args.projectDir,
      });
      const projectStyleTemplate = await loadEffectivePromptTemplate('project.style', {
        userDataPath,
        projectDir: args.projectDir,
      });
      const projectStylePrompt = getProjectStylePromptFromTemplate(projectStyleTemplate);
      return await regenerateCoverPrompt(args.entries, args.settings, {
        globalPrompt: args.globalPrompt,
        projectStylePrompt,
        currentPrompt: args.currentPrompt,
        coverTemplate,
        projectBindings: args.projectBindings ?? null,
      });
    } catch (error) {
      writeAppLog(
        'error',
        'ai-analysis',
        '封面提示词重生成失败',
        error instanceof Error ? error.stack ?? error.message : String(error),
      );
      throw error;
    }
  },
);

ipcMain.handle(
  'generate-cover-images',
  async (
    _event,
    args: {
      prompts: string[];
      settings: AISettings;
      projectDir: string;
      projectBindings?: PromptBindingMap | null;
      telemetryRunId?: string | null;
    },
  ) => {
    const telemetry = makeMainTelemetry(args.telemetryRunId);
    const coverStart = Date.now();
    telemetry.emit('stage.start', { stage: 'cover', prompts: args.prompts.length });
    const coversDir = path.join(args.projectDir, 'covers');
    const binding = resolvePromptBinding(
      'cover.regeneration',
      args.settings,
      args.projectBindings ?? null,
    );
    if (!binding.imageProvider || !binding.imageModel) {
      throw new Error('cover.regeneration 未绑定 ImageProvider/Model');
    }
    const userDataPath = app.getPath('userData');
    const projectStyleTemplate = await loadEffectivePromptTemplate('project.style', {
      userDataPath,
      projectDir: args.projectDir,
    });
    const projectStylePrompt = getProjectStylePromptFromTemplate(projectStyleTemplate);
    const coverSuffix = (args.settings.globalCoverImagePrompt ?? '').trim();
    const mergedPrompts = args.prompts.map((prompt) => {
      const withCoverSuffix = coverSuffix ? `${prompt.trim()}\n${coverSuffix}` : prompt;
      return appendProjectStylePrompt(withCoverSuffix, projectStylePrompt);
    });
    const total = mergedPrompts.length;
    const coverProgressCtx = {
      taskId: 'cover-generation',
      signal: new AbortController().signal,
      onProgress: (update: { percent?: number; phase?: string; message?: string }) => {
        mainWindow?.webContents.send('cover-progress', {
          percent: update.percent ?? 0,
          phase: update.phase ?? 'rendering',
          message: update.message ?? '',
          total,
        });
      },
    };
    try {
      const candidates = await generateCoverCandidates(
        mergedPrompts,
        binding.imageProvider,
        binding.imageModel,
        coversDir,
        coverProgressCtx,
      );
      telemetry.emit('stage.end', {
        stage: 'cover',
        durationMs: Date.now() - coverStart,
        ok: true,
        total: candidates.length,
        succeeded: candidates.filter((c) => c.imageUrl && !c.error).length,
      });
      return candidates;
    } catch (err) {
      telemetry.emit('stage.end', {
        stage: 'cover',
        durationMs: Date.now() - coverStart,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
);

// AI 卡片媒体生成共享的 AbortController 注册表（image / video / cancel 复用）
const cardMediaAbortMap = new Map<string, AbortController>();

ipcMain.handle(
  'generate-card-image',
  async (
    _event,
    args: GenerateCardImageArgs & {
      settings: AISettings;
      projectBindings?: PromptBindingMap | null;
    },
  ) => {
    const prev = cardMediaAbortMap.get(args.cardId);
    prev?.abort();
    const ac = new AbortController();
    cardMediaAbortMap.set(args.cardId, ac);
    try {
      const userDataPath = app.getPath('userData');
      const projectStyleTemplate = await loadEffectivePromptTemplate('project.style', {
        userDataPath,
        projectDir: args.projectDir,
      });
      const projectStylePrompt = getProjectStylePromptFromTemplate(projectStyleTemplate);
      return await handleGenerateCardImage(args, {
        settings: args.settings,
        projectBindings: args.projectBindings ?? null,
        projectStylePrompt,
        signal: ac.signal,
        onProgress: (u) => {
          mainWindow?.webContents.send('card-media-progress', {
            cardId: args.cardId,
            percent: u.percent,
            phase: u.phase,
            message: u.message,
            taskId: `card-media-${args.cardId}`,
          });
        },
      });
    } finally {
      if (cardMediaAbortMap.get(args.cardId) === ac) {
        cardMediaAbortMap.delete(args.cardId);
      }
    }
  },
);

ipcMain.handle(
  'generate-card-video',
  async (
    _event,
    args: GenerateCardVideoArgs & {
      settings: AISettings;
      projectBindings?: PromptBindingMap | null;
    },
  ) => {
    const prev = cardMediaAbortMap.get(args.cardId);
    prev?.abort();
    const ac = new AbortController();
    cardMediaAbortMap.set(args.cardId, ac);
    try {
      const userDataPath = app.getPath('userData');
      const projectStyleTemplate = await loadEffectivePromptTemplate('project.style', {
        userDataPath,
        projectDir: args.projectDir,
      });
      const projectStylePrompt = getProjectStylePromptFromTemplate(projectStyleTemplate);
      return await handleGenerateCardVideo(args, {
        settings: args.settings,
        projectBindings: args.projectBindings ?? null,
        projectStylePrompt,
        signal: ac.signal,
        onProgress: (u) => {
          mainWindow?.webContents.send('card-media-progress', {
            cardId: args.cardId,
            percent: u.percent,
            phase: u.phase,
            message: u.message,
            taskId: `card-media-${args.cardId}`,
          });
        },
      });
    } finally {
      if (cardMediaAbortMap.get(args.cardId) === ac) {
        cardMediaAbortMap.delete(args.cardId);
      }
    }
  },
);

ipcMain.handle('cancel-card-media-generation', async (_event, args: { cardId: string }) => {
  const ac = cardMediaAbortMap.get(args.cardId);
  ac?.abort();
  cardMediaAbortMap.delete(args.cardId);
  return { ok: true as const };
});

ipcMain.handle('delete-card-media-assets', async (_event, args: { projectDir: string; cardId: string }) => {
  const { deleteCardAssets } = await import('./ai-card-assets');
  await deleteCardAssets(args.projectDir, args.cardId);
  return { ok: true as const };
});

ipcMain.handle('load-project', async (_event, projectDir: string) => {
  const data = await loadProjectFile(projectDir);
  setActiveProjectPath(projectDir);
  return JSON.stringify(data, null, 2);
});

ipcMain.handle(
  'save-project-section',
  async (_event, projectDir: string, section: string, data: string) => {
    const parsed = JSON.parse(data);
    await saveProjectSection(
      projectDir,
      section as 'timeline' | 'aiAnalysis' | 'script' | 'workflowMeta',
      parsed,
    );
  },
);

ipcMain.handle('scan-project-directory', async (_event, projectDir: string) => {
  return scanProjectDirectory(projectDir);
});

ipcMain.handle('import-project', async (_event, args: ImportProjectArgs) => {
  try {
    const result = await importProject(args);
    return { ok: true as const, result };
  } catch (err) {
    if (err instanceof ImportProjectError) {
      return {
        ok: false as const,
        error: { code: err.code, message: err.message },
      };
    }
    return {
      ok: false as const,
      error: { code: 'scan_failed' as const, message: (err as Error).message },
    };
  }
});

ipcMain.handle('load-global-settings', async () => {
  const userDataPath = app.getPath('userData');
  const settings = await loadGlobalSettings(userDataPath);
  return settings ? JSON.stringify(settings) : null;
});

ipcMain.on('load-global-settings-sync', (event) => {
  const userDataPath = app.getPath('userData');
  const settings = loadGlobalSettingsSync(userDataPath);
  event.returnValue = settings ? JSON.stringify(settings) : null;
});

ipcMain.handle('save-global-settings', async (_event, data: string) => {
  const userDataPath = app.getPath('userData');
  const settings = JSON.parse(data) as GlobalSettingsFile;
  await saveGlobalSettings(userDataPath, settings);
});

ipcMain.handle('config-backup:export', async () => {
  const userDataPath = app.getPath('userData');
  const appVersion = app.getVersion();
  const backup = await collectBackup(userDataPath, AGENT_CONFIG_PATH, appVersion);

  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, {
        title: '导出配置备份',
        defaultPath: defaultExportFileName(),
        filters: [{ name: '灵机配置备份', extensions: ['lingji-backup.json', 'json'] }],
      })
    : await dialog.showSaveDialog({
        title: '导出配置备份',
        defaultPath: defaultExportFileName(),
        filters: [{ name: '灵机配置备份', extensions: ['lingji-backup.json', 'json'] }],
      });
  if (result.canceled || !result.filePath) {
    return { canceled: true as const };
  }

  await fs.writeFile(result.filePath, JSON.stringify(backup, null, 2), 'utf-8');
  return { canceled: false as const, filePath: result.filePath };
});

ipcMain.handle('config-backup:preview', async () => {
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, {
        title: '选择配置备份文件',
        filters: [{ name: '灵机配置备份', extensions: ['lingji-backup.json', 'json'] }],
        properties: ['openFile'],
      })
    : await dialog.showOpenDialog({
        title: '选择配置备份文件',
        filters: [{ name: '灵机配置备份', extensions: ['lingji-backup.json', 'json'] }],
        properties: ['openFile'],
      });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true as const };
  }

  const filePath = result.filePaths[0];
  const raw = await fs.readFile(filePath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigBackupValidationError('备份文件不是合法的 JSON');
  }
  const backup = validateBackup(parsed);
  return {
    canceled: false as const,
    filePath,
    schemaVersion: backup.schemaVersion,
    exportedAt: backup.exportedAt,
    appVersion: backup.appVersion,
    platform: backup.platform,
  };
});

ipcMain.handle(
  'config-backup:import',
  async (_event, args: { filePath: string }) => {
    const { filePath } = args;
    const raw = await fs.readFile(filePath, 'utf-8');
    const backup = validateBackup(JSON.parse(raw));

    const userDataPath = app.getPath('userData');
    const { settingsBackupPath, agentBackupPath } = await backupCurrent(
      userDataPath,
      AGENT_CONFIG_PATH,
    );
    await applyBackup(backup, userDataPath, AGENT_CONFIG_PATH);

    return {
      appliedFrom: filePath,
      settingsBackupPath,
      agentBackupPath,
    };
  },
);

// ─── Prompts 配置 ──────────────────────────────────────

function assertPromptKind(kind: unknown): PromptKind {
  if (!isPromptKind(kind)) {
    throw new Error(`未知的 prompt kind：${String(kind)}`);
  }
  return kind;
}

function assertPromptScope(scope: unknown): PromptScope {
  if (scope === 'global' || scope === 'project' || scope === 'builtin') return scope;
  throw new Error(`未知的 prompt scope：${String(scope)}`);
}

function assertWritableScope(scope: unknown): 'global' | 'project' {
  if (scope === 'global' || scope === 'project') return scope;
  throw new Error(`不可写的 prompt scope：${String(scope)}`);
}

ipcMain.handle('prompts:list', async (_event, args: { projectDir?: string } = {}) => {
  const userDataPath = app.getPath('userData');
  const overview = await listPromptOverview({ userDataPath, projectDir: args.projectDir });
  return overview.map((item) => ({
    ...item,
    meta: PROMPT_KIND_META[item.kind],
  }));
});

ipcMain.handle('prompts:kinds', async () => {
  return PROMPT_KINDS.map((kind) => ({
    kind,
    meta: PROMPT_KIND_META[kind],
  }));
});

ipcMain.handle(
  'prompts:read',
  async (
    _event,
    args: { kind: string; scope: string; projectDir?: string },
  ) => {
    const kind = assertPromptKind(args.kind);
    const scope = assertPromptScope(args.scope);
    const userDataPath = app.getPath('userData');
    const content = await readPromptUserText(scope, kind, {
      userDataPath,
      projectDir: args.projectDir,
    });
    return { kind, scope, content };
  },
);

ipcMain.handle(
  'prompts:read-effective',
  async (_event, args: { kind: string; projectDir?: string }) => {
    const kind = assertPromptKind(args.kind);
    const userDataPath = app.getPath('userData');
    const effective = await loadEffectivePromptTemplate(kind, {
      userDataPath,
      projectDir: args.projectDir,
    });
    return { kind, ...effective };
  },
);

ipcMain.handle(
  'prompts:write',
  async (
    _event,
    args: { kind: string; scope: string; content: string; projectDir?: string },
  ) => {
    const kind = assertPromptKind(args.kind);
    const scope = assertWritableScope(args.scope);
    const userDataPath = app.getPath('userData');
    const filePath = await writePromptUserText(scope, kind, args.content, {
      userDataPath,
      projectDir: args.projectDir,
    });
    return { kind, scope, filePath };
  },
);

ipcMain.handle(
  'prompts:delete',
  async (
    _event,
    args: { kind: string; scope: string; projectDir?: string },
  ) => {
    const kind = assertPromptKind(args.kind);
    const scope = assertWritableScope(args.scope);
    const userDataPath = app.getPath('userData');
    const removed = await deletePromptYaml(scope, kind, {
      userDataPath,
      projectDir: args.projectDir,
    });
    return { kind, scope, removed };
  },
);

ipcMain.handle('prompts:default', async (_event, args: { kind: string }) => {
  const kind = assertPromptKind(args.kind);
  return { kind, content: getBuiltinPromptTemplate(kind).user };
});

ipcMain.handle(
  'prompts:readBindings',
  async (_event, args: { scope: 'project'; projectDir: string }) => {
    if (args.scope !== 'project') throw new Error('readBindings: 仅支持 project scope');
    if (!args.projectDir || !path.isAbsolute(args.projectDir)) {
      throw new Error('readBindings: 需要绝对路径 projectDir');
    }
    return readPromptBindings({ projectDir: args.projectDir });
  },
);

ipcMain.handle(
  'prompts:writeBindings',
  async (
    _event,
    args: { scope: 'project'; bindings: unknown; projectDir: string },
  ) => {
    if (args.scope !== 'project') throw new Error('writeBindings: 仅支持 project scope');
    if (!args.projectDir || !path.isAbsolute(args.projectDir)) {
      throw new Error('writeBindings: 需要绝对路径 projectDir');
    }
    if (!args.bindings || typeof args.bindings !== 'object') {
      throw new Error('writeBindings: bindings 必须是对象');
    }
    await writePromptBindings(
      args.bindings as Parameters<typeof writePromptBindings>[0],
      { projectDir: args.projectDir },
    );
  },
);

ipcMain.handle('user-prompts:categories', async () => {
  return Object.values(PROMPT_CATEGORY_META);
});

ipcMain.handle(
  'user-prompts:list',
  async (_event, args: { category: string }) => {
    const category = assertPromptCategory(args?.category);
    const userDataPath = app.getPath('userData');
    const entries = await listUserPromptEntries(category, { userDataPath });
    return entries;
  },
);

ipcMain.handle(
  'user-prompts:read',
  async (_event, args: { category: string; id: string }) => {
    const category = assertPromptCategory(args?.category);
    const userDataPath = app.getPath('userData');
    const entry = await readUserPromptEntry(category, args.id, { userDataPath });
    return entry;
  },
);

ipcMain.handle(
  'user-prompts:write',
  async (
    _event,
    args: {
      category: string;
      id: string;
      name: string;
      description: string;
      version?: number;
      system: string;
      user: string;
      ttsStyle?: string;
      ttsAnnotateHint?: string;
    },
  ) => {
    const category = assertPromptCategory(args?.category);
    const userDataPath = app.getPath('userData');
    if (!args.id || typeof args.id !== 'string') {
      throw new Error('user-prompts:write 缺少 id');
    }
    if (!args.name || typeof args.name !== 'string') {
      throw new Error('user-prompts:write 缺少 name');
    }
    if (typeof args.user !== 'string' || !args.user.trim()) {
      throw new Error('user-prompts:write 缺少 user');
    }
    const entry = await writeUserPromptEntry(
      {
        id: args.id,
        category,
        name: args.name,
        description: args.description ?? '',
        version: args.version,
        system: args.system ?? '',
        user: args.user,
        ttsStyle: args.ttsStyle,
        ttsAnnotateHint: args.ttsAnnotateHint,
      },
      { userDataPath },
    );
    return entry;
  },
);

ipcMain.handle(
  'user-prompts:delete',
  async (_event, args: { category: string; id: string }) => {
    const category = assertPromptCategory(args?.category);
    const userDataPath = app.getPath('userData');
    const result = await deleteUserPromptEntry(category, args.id, { userDataPath });
    return result;
  },
);

ipcMain.handle(
  'user-prompts:seed',
  async (_event, args: { category: string; id: string }) => {
    const category = assertPromptCategory(args?.category);
    const seed = getUserPromptSeed(category, args.id);
    return seed;
  },
);

ipcMain.handle('save-timeline', async (_event, projectDir: string, data: string) => {
  await fs.mkdir(projectDir, { recursive: true });
  // Web Card 已下线：timeline 直接落盘，不再有 materialize 逻辑。
  await fs.writeFile(path.join(projectDir, 'timeline.json'), data, 'utf-8');
  return data;
});

ipcMain.handle('load-timeline', async (_event, projectDir: string) => {
  try {
    const filePath = path.join(projectDir, 'timeline.json');
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
});

ipcMain.handle('save-ai-analysis', async (_event, projectDir: string, data: string) => {
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(path.join(projectDir, 'ai-analysis.json'), data, 'utf-8');
  return data;
});

ipcMain.handle('load-ai-analysis', async (_event, projectDir: string) => {
  try {
    const filePath = path.join(projectDir, 'ai-analysis.json');
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
});

ipcMain.handle('get-project-metadata', async (_event, projectDir: string) => {
  return readProjectMetadata(projectDir);
});

ipcMain.handle('set-menu-context', async (_event, context: MenuContext) => {
  menuContext = {
    activePage: context.activePage,
    hasProject: context.hasProject,
    recentProjects: Array.isArray(context.recentProjects)
      ? context.recentProjects
          .filter((project) => Boolean(project?.path))
          .map((project) => ({
            path: project.path,
            name: project.name || path.basename(project.path),
          }))
      : [],
    isAutoRunning: Boolean(context.isAutoRunning),
  };

  refreshApplicationMenu();
});

ipcMain.handle('show-editor-context-menu', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const menu = Menu.buildFromTemplate([
    { label: '剪切', role: 'cut' },
    { label: '复制', role: 'copy' },
    { label: '粘贴', role: 'paste' },
    { type: 'separator' },
    { label: '全选', role: 'selectAll' },
    { type: 'separator' },
    {
      label: '搜索',
      accelerator: 'CmdOrCtrl+F',
      click: () =>
        event.sender.send('menu-action', { type: 'command', action: 'find' }),
    },
    {
      label: '搜索与替换',
      accelerator: 'CmdOrCtrl+H',
      click: () =>
        event.sender.send('menu-action', { type: 'command', action: 'find-replace' }),
    },
  ]);
  menu.popup({ window: win });
});

ipcMain.handle(
  'show-workbench-tab-context-menu',
  async (
    event,
    request: {
      file: string;
      projectDir: string | null;
      tabIndex: number;
      tabCount: number;
    },
  ) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    const absolutePath = request.projectDir
      ? path.resolve(request.projectDir, request.file)
      : null;

    const menu = Menu.buildFromTemplate(
      createWorkbenchTabContextMenuTemplate({
        file: request.file,
        tabIndex: request.tabIndex,
        tabCount: request.tabCount,
        hasResolvedPath: Boolean(absolutePath),
        onMenuAction: (action, file) => {
          win.webContents.send('workbench-tab-menu-action', { action, file });
        },
        onCopyPath: () => {
          if (absolutePath) {
            clipboard.writeText(absolutePath);
          }
        },
        onRevealInFileManager: () => {
          if (absolutePath) {
            shell.showItemInFolder(absolutePath);
          }
        },
      }),
    );

    menu.popup({ window: win });
  },
);

ipcMain.handle('select-project-directory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });

  return result.canceled ? null : result.filePaths[0];
});

const AUDIO_EXTENSIONS_FILTER = ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus'];
const VIDEO_EXTENSIONS_FILTER = ['mp4', 'mov', 'webm', 'm4v'];
const IMAGE_EXTENSIONS_FILTER = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

ipcMain.handle('select-setup-file', async (_event, kind: 'audio' | 'srt') => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters:
      kind === 'audio'
        ? [{ name: '音频文件', extensions: AUDIO_EXTENSIONS_FILTER }]
        : [{ name: 'SRT Subtitle', extensions: ['srt'] }],
  });

  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-media-file', async (_event, kind: 'audio' | 'video' | 'srt') => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters:
      kind === 'audio'
        ? [{ name: '音频文件', extensions: AUDIO_EXTENSIONS_FILTER }]
        : kind === 'video'
          ? [{ name: '视频文件', extensions: VIDEO_EXTENSIONS_FILTER }]
          : [{ name: 'SRT Subtitle', extensions: ['srt'] }],
  });

  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('add-asset', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      {
        name: '媒体素材',
        extensions: [
          ...VIDEO_EXTENSIONS_FILTER,
          ...IMAGE_EXTENSIONS_FILTER,
          ...AUDIO_EXTENSIONS_FILTER,
        ],
      },
    ],
  });

  if (result.canceled) {
    return null;
  }

  const assetPath = result.filePaths[0];
  const extension = path.extname(assetPath).toLowerCase().replace(/^\./, '');
  const isVideo = VIDEO_EXTENSIONS_FILTER.includes(extension);
  const isAudio = AUDIO_EXTENSIONS_FILTER.includes(extension);
  let durationMs = isAudio || isVideo ? 10000 : 5000;

  const { ffprobePath } = resolveRuntimeBinaries();
  if (isAudio) {
    try {
      durationMs = await readAudioDurationMs(assetPath, { ffprobePath });
    } catch {
      durationMs = 10000;
    }
  }

  if (isVideo) {
    try {
      durationMs = await readVideoDurationMs(assetPath, { ffprobePath });
    } catch (error) {
      writeAppLog(
        'warn',
        'add-asset',
        `读取媒体时长失败: ${assetPath}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const type: 'video' | 'audio' | 'image' = isVideo ? 'video' : isAudio ? 'audio' : 'image';

  return {
    path: assetPath,
    type,
    durationMs,
  };
});

// ── 自动扫描项目目录下的媒体素材 ──

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.m4v']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg']);
const SRT_EXTS = new Set(['.srt']);

type ScannedAssetType = 'video' | 'image' | 'audio' | 'srt';

function classifyExtension(ext: string): ScannedAssetType | null {
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (SRT_EXTS.has(ext)) return 'srt';
  return null;
}

ipcMain.handle('scan-project-assets', async (_event, projectDir: string) => {
  const results: { path: string; type: ScannedAssetType; durationMs: number }[] = [];
  const { ffprobePath } = resolveRuntimeBinaries();

  async function scanDir(dir: string, depth: number) {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && depth < 2) {
        await scanDir(fullPath, depth + 1);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      const assetType = classifyExtension(ext);
      if (!assetType) continue;

      let durationMs = assetType === 'image' ? 5000 : 10000;

      if (assetType === 'audio') {
        try {
          durationMs = await readAudioDurationMs(fullPath, { ffprobePath });
        } catch {
          durationMs = 10000;
        }
      }

      if (assetType === 'video') {
        try {
          durationMs = await readVideoDurationMs(fullPath, { ffprobePath });
        } catch (error) {
          writeAppLog(
            'warn',
            'asset-scan',
            `读取媒体时长失败: ${fullPath}`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      results.push({ path: fullPath, type: assetType, durationMs });
    }
  }

  await scanDir(projectDir, 0);
  return results;
});

ipcMain.handle('scan-import-directory', async (_event, dir: string) => {
  const audioFiles: string[] = [];
  const srtFiles: string[] = [];

  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return { audioFiles, srtFiles };
  }

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (AUDIO_EXTS.has(ext)) {
      audioFiles.push(path.join(dir, entry.name));
    } else if (SRT_EXTS.has(ext)) {
      srtFiles.push(path.join(dir, entry.name));
    }
  }

  return { audioFiles, srtFiles };
});

ipcMain.handle(
  'save-script-file',
  async (_event, projectDir: string, filename: string, content: string) => {
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(path.join(projectDir, filename), content, 'utf-8');
  },
);

ipcMain.handle(
  'load-script-file',
  async (_event, projectDir: string, filename: string) => {
    const filePath = path.join(projectDir, filename);
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  },
);

ipcMain.handle('save-script-state', async (_event, projectDir: string, state: string) => {
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(path.join(projectDir, 'script-state.json'), state, 'utf-8');
});

ipcMain.handle('load-script-state', async (_event, projectDir: string) => {
  const filePath = path.join(projectDir, 'script-state.json');
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
});

ipcMain.handle('select-text-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择报告文件',
    filters: [{ name: '文本文件', extensions: ['txt', 'md', 'html', 'htm'] }],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, 'utf-8');
  return { path: filePath, content };
});

// 轻量级抖音链接解析：仅获取标题和视频 ID，不下载视频
ipcMain.handle('resolve-douyin-url', async (_event, url: string) => {
  writeAppLog('info', 'douyin-resolve', '解析抖音链接', url);
  const result = await resolveDouyinVideoSource(url);
  return { title: result.title, videoId: result.videoId };
});

ipcMain.handle('import-video-source', async (_event, request: VideoImportRequest) => {
  writeAppLog(
    'info',
    'video-import',
    '收到视频导入请求',
    `${request.sourceType}: ${request.sourceType === 'douyin' ? request.url : request.filePath}`,
  );
  return videoImportService.startImport(request);
});

ipcMain.handle('get-video-import-status', async (_event, importId: string) => {
  return videoImportService.getImportStatus(importId);
});

ipcMain.handle('start-watching', async (_event, dir: string) => {
  await fileWatcher?.close();

  fileWatcher = chokidar.watch(dir, {
    depth: 3,
    ignoreInitial: true,
    ignored: /(^|[/\\])\../,
  });

  fileWatcher.on('change', async (filePath: string) => {
    const relative = path.relative(dir, filePath);
    if (!relative.endsWith('.md') && !relative.endsWith('.json')) return;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      mainWindow?.webContents.send('file-changed', { file: relative, content });
    } catch {
      // 文件可能已被删除，直接忽略。
    }
  });

  fileWatcher.on('add', (filePath: string) => {
    const relative = path.relative(dir, filePath);
    mainWindow?.webContents.send('file-tree-changed', { type: 'add', file: relative });
  });

  fileWatcher.on('unlink', (filePath: string) => {
    const relative = path.relative(dir, filePath);
    mainWindow?.webContents.send('file-tree-changed', { type: 'unlink', file: relative });
  });
});

ipcMain.handle('stop-watching', async () => {
  await fileWatcher?.close();
  fileWatcher = null;
});

ipcMain.handle('read-directory', async (_event, dir: string) => {
  interface DirectoryEntry {
    name: string;
    type: 'file' | 'directory';
    children?: DirectoryEntry[];
  }

  async function readDir(dirPath: string, currentDepth: number): Promise<DirectoryEntry[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const result: DirectoryEntry[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory() && currentDepth < 3) {
        const children = await readDir(path.join(dirPath, entry.name), currentDepth + 1);
        result.push({ name: entry.name, type: 'directory', children });
        continue;
      }

      if (entry.isFile()) {
        result.push({ name: entry.name, type: 'file' });
      }
    }

    return result.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    });
  }

  return readDir(dir, 0);
});

ipcMain.handle('select-output-path', async (_event, defaultPath?: string) => {
  if (!mainWindow) return null;
  const resolvedDefault =
    typeof defaultPath === 'string' && defaultPath.trim().length > 0
      ? defaultPath
      : 'podcast-export.mp4';
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: resolvedDefault,
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });

  return result.canceled ? null : result.filePath;
});

ipcMain.handle('check-file-exists', async (_event, targetPath?: string) => {
  if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
    return false;
  }
  try {
    const stat = await fs.stat(targetPath);
    return stat.isFile();
  } catch {
    return false;
  }
});

ipcMain.handle('confirm-overwrite', async (_event, targetPath?: string) => {
  if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
    return true;
  }
  const fileName = path.basename(targetPath);
  const options = {
    type: 'warning' as const,
    buttons: ['取消', '覆盖导出'],
    defaultId: 0,
    cancelId: 0,
    title: '文件已存在',
    message: `目标位置已存在同名文件 "${fileName}"`,
    detail: `继续导出将覆盖该文件。\n\n${targetPath}`,
  };
  const { response } = mainWindow
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);
  return response === 1;
});

ipcMain.handle(
  'generate-tts',
  async (
    _event,
    args: {
      requestId: string;
      text: string;
      provider?: TTSProvider;
      voice?: TTSVoicePreset;
      voiceId?: string;
      speed?: number;
      vol?: number;
      pitch?: number;
      emotion?: string;
      model?: string;
      apiKey?: string;
      projectDir: string;
      telemetryRunId?: string | null;
      styleInstruction?: string;
      sentences?: Array<{ subtitle: string; speak: string }>;
    },
  ) => {
    const { requestId, text, projectDir } = args;
    const provider =
      args.provider ??
      buildLegacyMinimaxTTSProvider({
        minimaxApiKey: args.apiKey ?? '',
        minimaxModel: args.model ?? 'speech-2.8-hd',
      });
    const voice =
      args.voice ??
      buildLegacyMinimaxTTSVoice({
        minimaxVoiceId: args.voiceId ?? 'male-qn-qingse',
        minimaxSpeed: args.speed ?? 1,
        minimaxVol: args.vol ?? 1,
        minimaxPitch: args.pitch ?? 0,
        minimaxEmotion: args.emotion ?? '',
        minimaxModel: args.model ?? 'speech-2.8-hd',
      });
    const model = voice.model ?? provider.models[0] ?? '';
    const controller = new AbortController();
    activeTtsRequests.set(requestId, controller);
    mainWindow?.webContents.send('tts-progress', 0);
    const ttsTelemetry = makeMainTelemetry(args.telemetryRunId);
    const ttsStartTs = Date.now();
    ttsTelemetry.emit('stage.start', {
      stage: 'tts',
      chars: text.length,
      model,
      providerType: provider.type,
      voiceSource: voice.source,
    });

    // MiniMax t2a_v2 是同步接口，等待 30~120s。期间无回调信号，用估算心跳把进度从 2% 缓慢推到 30%，
    // 避免 UI 视觉上"卡在 0%"。fetch 返回后会立刻覆盖到 35%。
    let heartbeatPct = 2;
    const HEARTBEAT_CEIL = 30;
    const heartbeat = setInterval(() => {
      if (heartbeatPct < HEARTBEAT_CEIL) {
        heartbeatPct = Math.min(HEARTBEAT_CEIL, heartbeatPct + 1);
        mainWindow?.webContents.send('tts-progress', heartbeatPct);
      }
    }, 1500);

    try {
      await fs.mkdir(projectDir, { recursive: true });
      let audioPath: string;
      let durationMs = 0;
      let srtText = '';
      const isMimoChunked =
        provider.type === 'xiaomi_mimo' && Array.isArray(args.sentences) && args.sentences.length > 0;

      if (isMimoChunked) {
        const chunks = groupSentencesByBudget(args.sentences!, MIMO_TTS_CHUNK_CHAR_BUDGET);
        const { ffmpegPath: ffmpegPathOrNull, ffprobePath } = resolveRuntimeBinaries();
        if (!ffmpegPathOrNull) throw new Error('ffmpeg 未找到，无法合并 MiMo 分块音频');
        const ffmpegPath = ffmpegPathOrNull;
        audioPath = path.join(projectDir, 'podcast-audio.wav');
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lingji-tts-'));
        const parts: ChunkPart[] = [];
        const partPaths: string[] = [];
        try {
          for (let i = 0; i < chunks.length; i++) {
            const speakText = chunks[i].map((u) => u.speak).join('');
            let buf: Buffer | null = null;
            let lastErr: unknown;
            for (let attempt = 0; attempt <= 2 && !buf; attempt++) {
              try {
                const r = await runTTSProvider({
                  text: speakText,
                  provider,
                  voice,
                  signal: controller.signal,
                  styleInstruction: args.styleInstruction,
                  speakText,
                });
                if (r.audioBuffer.byteLength > 0) buf = r.audioBuffer;
                else lastErr = new Error('MiMo 返回空音频');
              } catch (err) {
                lastErr = err;
                if ((err as { name?: string }).name === 'AbortError') throw err;
              }
            }
            if (!buf) throw lastErr instanceof Error ? lastErr : new Error('MiMo 分块合成失败');
            const partPath = path.join(tmpDir, `chunk-${i}.wav`);
            await fs.writeFile(partPath, buf);
            partPaths.push(partPath);
            parts.push({ durMs: await readAudioDurationMs(partPath, { ffprobePath }), units: chunks[i] });
            mainWindow?.webContents.send('tts-progress', 35 + Math.round((50 * (i + 1)) / chunks.length));
          }
          await concatWavFiles(partPaths, audioPath, { ffmpegPath });
          durationMs = parts.reduce((sum, p) => sum + p.durMs, 0);
          srtText = buildSrtFromChunks(parts);
          writeAppLog('info', 'tts', `MiMo 分块合成完成，块数=${chunks.length}，时长=${durationMs}ms，路径=${audioPath}`);
        } finally {
          await fs.rm(tmpDir, { recursive: true, force: true });
        }
      } else {
        const result = await runTTSProvider({ text, provider, voice, signal: controller.signal });
        writeAppLog('info', 'tts', 'TTS 同步响应接收完成', `provider=${provider.type}`);
        mainWindow?.webContents.send('tts-progress', 35);
        const audioBuf = result.audioBuffer;
        if (audioBuf.byteLength === 0) {
          throw new Error('TTS 未返回任何音频数据，请检查 API Key 及配置');
        }
        audioPath = path.join(projectDir, `podcast-audio.${result.audioExtension}`);
        await fs.writeFile(audioPath, audioBuf);
        writeAppLog('info', 'tts', `音频已保存，大小=${audioBuf.byteLength} 字节，路径=${audioPath}`);
        durationMs = result.durationMs ?? 0;
        if (durationMs <= 0) {
          try {
            durationMs = await readAudioDurationMs(audioPath, { ffprobePath: resolveRuntimeBinaries().ffprobePath });
          } catch (error) {
            writeAppLog('warn', 'tts', '读取音频时长失败，将使用 1 秒兜底', error instanceof Error ? error.message : String(error));
            durationMs = 1_000;
          }
        }
        srtText = result.subtitleText?.trim()
          ? result.subtitleText
          : text.trim()
            ? buildEstimatedSrtTextFromText(text, durationMs)
            : '';
      }

      mainWindow?.webContents.send('tts-progress', 70);
      const srtPath = path.join(projectDir, 'podcast-subtitles.srt');
      const originalSrtPath = path.join(projectDir, 'podcast-subtitles.original.srt');
      await fs.writeFile(srtPath, srtText, 'utf-8');
      await fs.writeFile(originalSrtPath, srtText, 'utf-8');
      mainWindow?.webContents.send('tts-progress', 100);
      ttsTelemetry.emit('stage.end', {
        stage: 'tts',
        durationMs: Date.now() - ttsStartTs,
        ok: true,
        audioDurationMs: durationMs,
      });

      return { audioPath, srtPath, durationMs };
    } catch (error) {
      ttsTelemetry.emit('stage.end', {
        stage: 'tts',
        durationMs: Date.now() - ttsStartTs,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      if ((error as { name?: string }).name === 'AbortError') {
        throw new Error('TTS 任务已取消');
      }
      const cause = (error as { cause?: unknown })?.cause;
      const causeMsg =
        cause instanceof Error
          ? `${cause.name}: ${cause.message}${(cause as { code?: string }).code ? ` (${(cause as { code?: string }).code})` : ''}`
          : cause
            ? String(cause)
            : '';
      writeAppLog(
        'error',
        'tts',
        'TTS fetch 失败',
        `${(error as Error)?.message ?? String(error)} | cause=${causeMsg || '<none>'}`,
      );
      if (causeMsg) {
        throw new Error(`TTS 网络失败: ${causeMsg}`);
      }
      throw error;
    } finally {
      clearInterval(heartbeat);
      activeTtsRequests.delete(requestId);
    }
  },
);

ipcMain.handle('cancel-tts', async (_event, requestId: string) => {
  activeTtsRequests.get(requestId)?.abort();
  activeTtsRequests.delete(requestId);
});

ipcMain.handle('get-app-logs', () => getAppLogs());

ipcMain.handle('get-app-log-file-path', () => getAppLogFilePath());

ipcMain.handle('toggle-devtools', () => {
  if (!mainWindow) {
    return;
  }

  const currentConfig = getCurrentAppConfig();
  const runtimeState = resolveDebugRuntimeState({
    isPackaged: app.isPackaged,
    debugMode: currentConfig.debugMode,
  });
  if (!runtimeState.allowDevTools) {
    writeAppLog('warn', 'security', '已拦截生产环境 DevTools 打开请求');
    return;
  }

  mainWindow.webContents.toggleDevTools();
});

ipcMain.on('show-item-in-folder', (_event, filePath: string) => {
  shell.showItemInFolder(filePath);
});

ipcMain.on('open-external', (_event, url: string) => {
  shell.openExternal(url);
});

// ── 最近项目管理 ──

ipcMain.handle('load-recent-projects', async () => {
  const userDataPath = app.getPath('userData');
  return await loadRecentProjects(userDataPath);
});

ipcMain.handle('add-recent-project', async (_event, projectDir: string, projectName?: string) => {
  const userDataPath = app.getPath('userData');
  const projects = await addRecentProject(userDataPath, projectDir, projectName);
  // 更新菜单上下文
  menuContext.recentProjects = projects.map((p) => ({
    path: p.path,
    name: p.name,
  }));
  refreshApplicationMenu();
  return projects;
});

ipcMain.handle('remove-recent-project', async (_event, projectDir: string) => {
  const userDataPath = app.getPath('userData');
  const projects = await removeRecentProjectFromStore(userDataPath, projectDir);
  // 更新菜单上下文
  menuContext.recentProjects = projects.map((p) => ({
    path: p.path,
    name: p.name,
  }));
  refreshApplicationMenu();
  return projects;
});

ipcMain.handle('refresh-recent-projects', async () => {
  const userDataPath = app.getPath('userData');
  const projects = await refreshRecentProjects(userDataPath);
  // 更新菜单上下文
  menuContext.recentProjects = projects.map((p) => ({
    path: p.path,
    name: p.name,
  }));
  refreshApplicationMenu();
  return projects;
});

ipcMain.handle(
  'render-video',
  async (
    _event,
    args: {
      timeline: string;
      outputPath: string;
      exportConfig: ExportConfig;
      // Renderer 侧 store 中切分后的字幕；若未提供则回退到磁盘原始 SRT。
      // 磁盘 .srt 文件始终保持 MiniMax 原始输出（不写回），所以若只靠主进程重解析
      // 就会忽略用户的字幕重切分结果，与预览播放器不一致。
      srtEntries?: SrtEntry[];
    },
  ) => {
    const isDev = !app.isPackaged;
    const renderLogPrefix = '[render-video]';
    const renderStartedAt = Date.now();
    const timestamp = () => `${((Date.now() - renderStartedAt) / 1000).toFixed(2)}s`;

    const timelineData = JSON.parse(args.timeline) as TimelineData;
    const srtEntries =
      args.srtEntries && args.srtEntries.length > 0
        ? args.srtEntries
        : timelineData.podcast.srtPath
          ? parseSrt(await fs.readFile(timelineData.podcast.srtPath, 'utf-8'))
          : [];

    const cpuCount = os.cpus().length;
    const explicitConcurrency = Math.max(1, Math.floor(cpuCount / 2));

    if (isDev) {
      console.log(`${renderLogPrefix} 开始导出`, {
        outputPath: args.outputPath,
        resolution: args.exportConfig.resolution,
        quality: args.exportConfig.quality,
        cpuCount,
        explicitConcurrency,
        platform: process.platform,
        arch: process.arch,
      });
    }

    const projectPrepStart = Date.now();
    const preparedProject = await prepareHyperframesProject(timelineData, srtEntries);

    if (isDev) {
      console.log(
        `${renderLogPrefix} HyperFrames 项目准备完成 耗时=${(
          (Date.now() - projectPrepStart) / 1000
        ).toFixed(2)}s @${timestamp()}`,
      );
    }

    try {
      const { ffmpegPath, ffprobePath } = resolveRuntimeBinaries();
      const renderStart = Date.now();
      mainWindow?.webContents.send('render-progress', 0.05);
      const hyperframesCliPath = resolveHyperframesCliPath({
        appPath: app.getAppPath(),
        resourcesPath: process.resourcesPath,
        cwd: process.cwd(),
        moduleDir: __dirname,
        existsSync,
      });
      const argsList = [
        hyperframesCliPath,
        'render',
        preparedProject.projectDir,
        '--output',
        args.outputPath,
        '--fps',
        String(timelineData.fps || 30),
        '--format',
        'mp4',
        '--quality',
        args.exportConfig.quality === 'high' ? 'high' : 'standard',
        '--workers',
        String(explicitConcurrency),
      ];

      await new Promise<void>((resolve, reject) => {
        const child = execFile(
          process.execPath,
          argsList,
          {
            cwd: preparedProject.projectDir,
            env: {
              ...process.env,
              ELECTRON_RUN_AS_NODE: '1',
              PATH: buildPathWithRuntimeBinaries(process.env.PATH, [ffmpegPath, ffprobePath]),
              Path: buildPathWithRuntimeBinaries(process.env.Path, [ffmpegPath, ffprobePath]),
            },
          },
          (error) => {
            if (error) reject(error);
            else resolve();
          },
        );
        child.stdout?.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          if (isDev) process.stdout.write(text);
          const frameMatch = text.match(/(\d+(?:\.\d+)?)%/);
          if (frameMatch) {
            const value = Number.parseFloat(frameMatch[1]);
            if (Number.isFinite(value)) {
              mainWindow?.webContents.send('render-progress', Math.max(0.05, Math.min(0.98, value / 100)));
            }
          }
        });
        child.stderr?.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          if (isDev) process.stderr.write(text);
        });
      });
      mainWindow?.webContents.send('render-progress', 1);

      if (isDev) {
        console.log(
          `${renderLogPrefix} hyperframes render 完成 总耗时=${((Date.now() - renderStart) / 1000).toFixed(2)}s`,
        );
      }

      return { outputPath: args.outputPath };
    } catch (err) {
      if (isDev) {
        console.error(`${renderLogPrefix} 导出失败 @${timestamp()}`, err);
      }
      throw err;
    } finally {
      await preparedProject.cleanup();
    }
  },
);

ipcMain.handle('save-cover-edit', async (_event, args) => {
  return saveCoverEdit(args);
});

ipcMain.handle('list-system-fonts', async () => {
  return listSystemFonts();
});

ipcMain.handle('llm:claude-code-acp-run', async (_event, args) => {
  return headlessAcpProvider.runPrompt(args);
});

ipcMain.handle('llm:claude-code-acp-cancel', async (_event, requestId: string) => {
  return headlessAcpProvider.cancel(requestId);
});

ipcMain.handle('llm:claude-code-acp-list-models', async () => {
  return headlessAcpProvider.listModels();
});

// 开发模式下让 Ctrl+C 能正常退出 Electron
if (process.env.NODE_ENV_ELECTRON_VITE === 'development') {
  process.on('SIGINT', () => app.quit());
  process.on('SIGTERM', () => app.quit());
}

registerAgentIpc(() => mainWindow);
registerConversationIpc(() => mainWindow);
registerMcpIpc(() => mainWindow);
registerScriptHistoryIpc();

// 设置 macOS 系统菜单栏应用名称
app.setName('灵机剪影');

app.whenReady().then(async () => {
  refreshAppConfig();
  // 开发模式下显式设置 Dock 图标；打包后 macOS 会使用 .app 自带的 icns
  if (process.platform === 'darwin' && !app.isPackaged) {
    const iconPath = resolveAppIconPath();
    if (iconPath && app.dock) {
      try {
        app.dock.setIcon(iconPath);
      } catch (err) {
        writeAppLog('warn', 'app', '设置 Dock 图标失败', String(err));
      }
    }
  }
  // 一次性迁移：把旧 customTemplates 转为 userData/prompts/script-template/*.yaml
  try {
    const userDataPath = app.getPath('userData');
    const migrateResult = await migrateLegacyScriptTemplates({ userDataPath });
    if (!migrateResult.skipped) {
      writeAppLog(
        'info',
        'user-prompts',
        `migrated legacy script templates: ${migrateResult.migrated}`,
      );
    }
  } catch (err) {
    writeAppLog('warn', 'user-prompts', '迁移旧口播模板失败', String(err));
  }
  createWindow();
  // 启动 PipelineService 并桥接任务进度到 renderer
  attachTaskProgressBridge(getPipelineService(), () => mainWindow);
  // 在 whenReady 内订阅，避免 electron-vite 开发模式下主模块 HMR 重新执行
  // 时多次叠加监听器；广播只发给 mainWindow，与其他通道（analyze-progress /
  // cover-progress / menu-action / app-log）保持一致。
  videoImportService.onProgress((snapshot) => {
    mainWindow?.webContents.send('video-import-progress', snapshot);
    mainWindow?.webContents.send('douyin-import-progress', snapshot);
  });
  // 启动 MCP Server
  try {
    await startMcpServer(19820, () => mainWindow);
  } catch (err) {
    console.error('[MCP] Failed to start server:', err);
  }
});

app.on('before-quit', () => {
  isAppQuitting = true;
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('window-all-closed', async () => {
  fileWatcher?.close();
  await stopMcpServer();
  app.quit();
});
