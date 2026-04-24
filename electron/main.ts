import { bundle } from '@remotion/bundler';
import { getVideoMetadata, renderMedia, selectComposition } from '@remotion/renderer';
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
import { analyzeSrt, regenerateAICard, regenerateCoverPrompt } from '../src/lib/ai-analysis';
import { buildExportRenderConfig, type ExportConfig } from '../src/lib/export-settings';
import { generateCoverCandidates } from '../src/lib/cover-generation';
import { resolvePromptBinding } from '../src/lib/llm/binding-resolver';
import { planStoryboardFromTranscript } from '../src/lib/storyboard-planner';
import { prepareTimelineForRemotionRender, type RenderAssetDescriptor } from '../src/lib/remotion-assets';
import type { PersistedAIState } from '../src/lib/ai-persistence';
import {
  buildMinimaxTtsRequestBody,
  decodeMinimaxAudioData,
  extractMinimaxSubtitleSentences,
  getMinimaxDurationMs,
  subtitleJsonToSRT,
  type MinimaxSubtitleSentence,
  type MinimaxTtsResponse,
} from '../src/lib/minimax-tts';
import { parseSrt } from '../src/lib/srt-parser';
import type { SrtEntry, TimelineData } from '../src/types';
import type { AICard, AISegment, AISettings, PromptBindingMap } from '../src/types/ai';
import { createApplicationMenuTemplate } from './app-menu';
import {
  loadRuntimeDebugConfigSync,
  resolveAppConfig,
  saveRuntimeDebugConfig,
  type ResolvedAppConfig,
} from './app-config';
import { toRendererConsoleLog } from './console-message';
import { resolveDebugRuntimeState, shouldAutoOpenDevTools } from './debug-runtime';
import { materializePersistedAIState, materializeTimelineWebCards } from './web-card-storage';
import { registerAgentIpc } from './acp/ipc';
import { registerConversationIpc } from './conversations/ipc';
import { registerMcpIpc } from './mcp/ipc';
import { registerScriptHistoryIpc } from './script-history/ipc';
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
  readRawPromptYaml,
  writePromptYaml,
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
  DEFAULT_PROMPT_YAML,
  PROMPT_CATEGORY_META,
  PROMPT_KIND_META,
  PROMPT_KINDS,
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
import {
  ensureRemotionDownloadsCwd,
  resolveRemotionBinariesDirectory,
} from './remotion-paths';

const execFileAsync = promisify(execFile);

const AGENT_CONFIG_PATH = path.join(os.homedir(), '.lingji', 'agent-config.json');

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
const remotionBinariesDirectory = resolveRemotionRendererBinariesDir();

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

function createWindow() {
  const isMac = process.platform === 'darwin';
  const currentConfig = getCurrentAppConfig();
  const runtimeState = resolveDebugRuntimeState({
    isPackaged: app.isPackaged,
    debugMode: currentConfig.debugMode,
  });
  const appIconPath = resolveAppIconPath();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: '#070b14',
    title: '灵机剪影',
    ...(appIconPath ? { icon: appIconPath } : {}),
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac
      ? {}
      : {
          titleBarOverlay: {
            color: '#09111f',
            symbolColor: '#d8e2ef',
            height: 58,
          },
        }),
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

function resolveCompositionEntryPath(): string {
  const candidates = [
    path.resolve(app.getAppPath(), 'src/remotion/index.ts'),
    path.resolve(process.cwd(), 'src/remotion/index.ts'),
    path.resolve(__dirname, '../src/remotion/index.ts'),
  ];

  const entryPath = candidates.find((candidate) => existsSync(candidate));
  if (!entryPath) {
    throw new Error('未找到 Remotion composition 入口文件 src/remotion/index.ts');
  }

  return entryPath;
}

function resolvePrebuiltRemotionBundleDir(): string | null {
  // 打包态优先使用 app.asar.unpacked 下的真实路径，避免 fs.cp 等 API 在
  // asar 虚拟路径上行为不一致（Electron 对 fs.cp 的 asar 兼容性较弱）。
  const appPath = app.getAppPath();
  const asarUnpackedPath = appPath.endsWith('.asar')
    ? `${appPath}.unpacked`
    : null;

  const candidates = [
    asarUnpackedPath ? path.resolve(asarUnpackedPath, 'dist-remotion') : null,
    path.resolve(appPath, 'dist-remotion'),
    path.resolve(__dirname, '../dist-remotion'),
    path.resolve(process.cwd(), 'dist-remotion'),
  ].filter((candidate): candidate is string => typeof candidate === 'string');

  return (
    candidates.find(
      (candidate) => existsSync(candidate) && existsSync(path.join(candidate, 'index.html')),
    ) ?? null
  );
}

function resolveRemotionRendererBinariesDir(): string | null {
  return resolveRemotionBinariesDirectory({
    appPath: app.getAppPath(),
    cwd: process.cwd(),
    moduleDir: __dirname,
    platform: process.platform,
    arch: process.arch,
    existsSync,
  });
}

async function materializeRenderAssets(
  publicDir: string,
  assets: RenderAssetDescriptor[],
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

async function copyDirectoryRecursive(sourceDir: string, targetDir: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        await copyDirectoryRecursive(sourcePath, targetPath);
      } else if (entry.isFile()) {
        await fs.copyFile(sourcePath, targetPath);
      }
    }),
  );
}

async function createRenderPublicDir(
  timeline: TimelineData,
): Promise<{ timeline: TimelineData; publicDir: string }> {
  const { timeline: renderTimeline, assets } = prepareTimelineForRemotionRender(timeline);
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lingjijianying-public-'));
  await materializeRenderAssets(publicDir, assets);

  return {
    timeline: renderTimeline,
    publicDir,
  };
}

interface PreparedRenderBundle {
  timeline: TimelineData;
  serveUrl: string;
  cleanup: () => Promise<void>;
  isPrebuilt: boolean;
}

async function prepareRenderBundle(
  timeline: TimelineData,
): Promise<PreparedRenderBundle> {
  const prebuiltDir = resolvePrebuiltRemotionBundleDir();

  if (prebuiltDir) {
    // 打包环境下：把预构建的 bundle 复制到 tmp 目录，再把素材写入 public/。
    // 这样既避开了 app.asar 不能 chdir 的问题，也能让 serve-handler 正常读取素材。
    const tmpBundleDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'lingjijianying-bundle-'),
    );
    await copyDirectoryRecursive(prebuiltDir, tmpBundleDir);

    const publicDir = path.join(tmpBundleDir, 'public');
    await fs.mkdir(publicDir, { recursive: true });

    const { timeline: renderTimeline, assets } = prepareTimelineForRemotionRender(timeline);
    await materializeRenderAssets(publicDir, assets);

    return {
      timeline: renderTimeline,
      serveUrl: tmpBundleDir,
      cleanup: async () => {
        await fs.rm(tmpBundleDir, { recursive: true, force: true });
      },
      isPrebuilt: true,
    };
  }

  // 开发环境：沿用运行时 bundle()。
  const { timeline: renderTimeline, publicDir } = await createRenderPublicDir(timeline);
  const serveUrl = await bundle({
    entryPoint: resolveCompositionEntryPath(),
    publicDir,
  });

  return {
    timeline: renderTimeline,
    serveUrl,
    cleanup: async () => {
      await fs.rm(publicDir, { recursive: true, force: true });
    },
    isPrebuilt: false,
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
  const metadata = await getVideoMetadata(filePath, {
    binariesDirectory: remotionBinariesDirectory,
  });
  return Math.max(1_000, Math.round((metadata.durationInSeconds ?? 0) * 1000));
});

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
      const result = await analyzeSrt(entries, args.settings, {
        globalPrompt: args.globalPrompt,
        planningTemplate,
        cardTemplate,
        projectBindings: args.projectBindings ?? null,
        onProgress: (progress) => {
          mainWindow?.webContents.send('analyze-progress', progress);
        },
      });
      writeAppLog(
        'info',
        'ai-analysis',
        '字幕分析完成',
        `cards=${result.cards.length}, coverPrompts=${result.coverPrompts.length}`,
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
  'plan-storyboard',
  async (
    _event,
    args: {
      entries?: SrtEntry[];
      srtContent?: string;
      settings: AISettings;
      globalPrompt?: string;
      projectBindings?: PromptBindingMap | null;
    },
  ) => {
    writeAppLog(
      'info',
      'ai-analysis',
      '收到视觉编排分析请求',
      `entries=${args.entries?.length ?? 0}, hasSrtContent=${Boolean(args.srtContent)}`,
    );
    const entries = Array.isArray(args.entries) && args.entries.length > 0
      ? args.entries
      : parseSrt(args.srtContent ?? '');

    try {
      const plan = await planStoryboardFromTranscript(entries, args.settings, {
        globalPrompt: args.globalPrompt,
        projectBindings: args.projectBindings ?? null,
      });
      writeAppLog(
        'info',
        'ai-analysis',
        '视觉编排分析完成',
        `suggestions=${plan.suggestions.length}, segments=${plan.segments.length}`,
      );
      return plan;
    } catch (error) {
      writeAppLog(
        'error',
        'ai-analysis',
        '视觉编排分析失败',
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
      return await regenerateAICard(args.entries, args.card, args.segment, args.settings, {
        globalPrompt: args.globalPrompt,
        cardPrompt: args.cardPrompt,
        programSummary: args.programSummary,
        keywords: args.keywords,
        cardTemplate,
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
      return await regenerateCoverPrompt(args.entries, args.settings, {
        globalPrompt: args.globalPrompt,
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
    },
  ) => {
    const coversDir = path.join(args.projectDir, 'covers');
    const binding = resolvePromptBinding(
      'cover.regeneration',
      args.settings,
      args.projectBindings ?? null,
    );
    if (!binding.imageProvider || !binding.imageModel) {
      throw new Error('cover.regeneration 未绑定 ImageProvider/Model');
    }
    const total = args.prompts.length;
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
    return generateCoverCandidates(
      args.prompts,
      binding.imageProvider,
      binding.imageModel,
      coversDir,
      coverProgressCtx,
    );
  },
);

ipcMain.handle('load-project', async (_event, projectDir: string) => {
  const data = await loadProjectFile(projectDir);
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
    const raw = await readRawPromptYaml(scope, kind, {
      userDataPath,
      projectDir: args.projectDir,
    });
    return { kind, scope, content: raw };
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
    const filePath = await writePromptYaml(scope, kind, args.content, {
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
  return { kind, content: DEFAULT_PROMPT_YAML[kind] };
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
  const parsedTimeline = JSON.parse(data) as TimelineData;
  const { data: normalizedTimeline } = await materializeTimelineWebCards(projectDir, parsedTimeline);
  const serializedTimeline = JSON.stringify(normalizedTimeline, null, 2);
  await fs.writeFile(path.join(projectDir, 'timeline.json'), serializedTimeline, 'utf-8');
  return serializedTimeline;
});

ipcMain.handle('load-timeline', async (_event, projectDir: string) => {
  try {
    const filePath = path.join(projectDir, 'timeline.json');
    const rawTimeline = await fs.readFile(filePath, 'utf-8');
    const parsedTimeline = JSON.parse(rawTimeline) as TimelineData;
    const { data: normalizedTimeline, changed } = await materializeTimelineWebCards(projectDir, parsedTimeline);
    const serializedTimeline = JSON.stringify(normalizedTimeline, null, 2);
    if (changed) {
      await fs.writeFile(filePath, serializedTimeline, 'utf-8');
    }
    return serializedTimeline;
  } catch {
    return null;
  }
});

ipcMain.handle('save-ai-analysis', async (_event, projectDir: string, data: string) => {
  await fs.mkdir(projectDir, { recursive: true });
  const parsedState = JSON.parse(data) as PersistedAIState;
  const { data: normalizedState } = await materializePersistedAIState(projectDir, parsedState);
  const serializedState = JSON.stringify(normalizedState, null, 2);
  await fs.writeFile(path.join(projectDir, 'ai-analysis.json'), serializedState, 'utf-8');
  return serializedState;
});

ipcMain.handle('load-ai-analysis', async (_event, projectDir: string) => {
  try {
    const filePath = path.join(projectDir, 'ai-analysis.json');
    const rawState = await fs.readFile(filePath, 'utf-8');
    const parsedState = JSON.parse(rawState) as PersistedAIState;
    const { data: normalizedState, changed } = await materializePersistedAIState(projectDir, parsedState);
    const serializedState = JSON.stringify(normalizedState, null, 2);
    if (changed) {
      await fs.writeFile(filePath, serializedState, 'utf-8');
    }
    return serializedState;
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

ipcMain.handle('select-media-file', async (_event, kind: 'audio' | 'srt') => {
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

  if (isVideo || isAudio) {
    try {
      const metadata = await getVideoMetadata(assetPath, {
        binariesDirectory: remotionBinariesDirectory,
      });
      const seconds = metadata.durationInSeconds;
      if (typeof seconds === 'number' && seconds > 0) {
        durationMs = Math.max(500, Math.round(seconds * 1000));
      } else {
        writeAppLog(
          'warn',
          'add-asset',
          `媒体时长为空: ${assetPath}`,
          JSON.stringify(metadata),
        );
      }
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

      if (assetType === 'video' || assetType === 'audio') {
        try {
          const metadata = await getVideoMetadata(fullPath, {
            binariesDirectory: remotionBinariesDirectory,
          });
          const seconds = metadata.durationInSeconds;
          if (typeof seconds === 'number' && seconds > 0) {
            durationMs = Math.max(500, Math.round(seconds * 1000));
          }
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
    filters: [{ name: '文本文件', extensions: ['txt', 'md'] }],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, 'utf-8');
  return { path: filePath, content };
});

ipcMain.handle('select-html-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 HTML 卡片文件',
    filters: [{ name: 'HTML 文件', extensions: ['html', 'htm'] }],
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
    `${request.sourceType}: ${request.url}`,
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

ipcMain.handle(
  'generate-tts',
  async (
    _event,
    args: {
      requestId: string;
      text: string;
      voiceId: string;
      speed: number;
      vol: number;
      pitch: number;
      emotion: string;
      model: string;
      apiKey: string;
      projectDir: string;
    },
  ) => {
    const { requestId, text, voiceId, speed, vol, pitch, emotion, model, apiKey, projectDir } =
      args;
    const controller = new AbortController();
    activeTtsRequests.set(requestId, controller);
    mainWindow?.webContents.send('tts-progress', 0);

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
      const response = await fetch('https://api.minimaxi.com/v1/t2a_v2', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify(
          buildMinimaxTtsRequestBody({
            text,
            voiceId,
            speed,
            vol,
            pitch,
            emotion,
            model,
          }),
        ),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => String(response.status));
        throw new Error(`MiniMax TTS 请求失败: ${errText}`);
      }

      const result = (await response.json()) as MinimaxTtsResponse;
      const baseResp = result.base_resp;
      if (baseResp && typeof baseResp.status_code === 'number' && baseResp.status_code !== 0) {
        throw new Error(
          `MiniMax TTS 接口错误: [${baseResp.status_code}] ${baseResp.status_msg ?? '未知错误'}`,
        );
      }

      writeAppLog(
        'info',
        'tts',
        'TTS 同步响应接收完成',
        `audio=${result.data?.audio ? '已返回' : '未返回'}, subtitle=${result.data?.subtitle_file ? '已返回' : '未返回'}`,
      );
      mainWindow?.webContents.send('tts-progress', 35);

      await fs.mkdir(projectDir, { recursive: true });

      const audioField = result.data?.audio ?? '';
      if (!audioField) {
        throw new Error('MiniMax TTS 未返回任何音频数据，请检查 API Key 及配置');
      }

      let audioBuf: Buffer;
      if (/^https?:\/\//.test(audioField)) {
        const audioResponse = await fetch(audioField, { signal: controller.signal });
        if (!audioResponse.ok) {
          throw new Error(`MiniMax 音频下载失败: HTTP ${audioResponse.status}`);
        }
        audioBuf = Buffer.from(await audioResponse.arrayBuffer());
      } else {
        audioBuf = decodeMinimaxAudioData(audioField);
      }

      const audioPath = path.join(projectDir, 'podcast-audio.mp3');
      await fs.writeFile(audioPath, audioBuf);
      writeAppLog(
        'info',
        'tts',
        `音频已保存，大小=${audioBuf.byteLength} 字节，路径=${audioPath}`,
      );

      if (audioBuf.byteLength === 0) {
        throw new Error('MiniMax TTS 未返回任何音频数据，请检查 API Key 及配置');
      }
      mainWindow?.webContents.send('tts-progress', 70);

      let subtitleSentences: MinimaxSubtitleSentence[] = [];
      if (result.data?.subtitle_file) {
        try {
          const subtitleResp = await fetch(result.data.subtitle_file, { signal: controller.signal });
          if (!subtitleResp.ok) {
            throw new Error(`字幕文件下载失败: HTTP ${subtitleResp.status}`);
          }
          subtitleSentences = extractMinimaxSubtitleSentences(await subtitleResp.json());
          writeAppLog(
            'info',
            'tts',
            `字幕下载成功，句数=${subtitleSentences.length}`,
          );
        } catch (err) {
          writeAppLog(
            'warn',
            'tts',
            '字幕文件下载失败，SRT 将为空',
            err instanceof Error ? err.message : String(err),
          );
        }
      } else {
        subtitleSentences = extractMinimaxSubtitleSentences(result.data);
        writeAppLog(
          'warn',
          'tts',
          subtitleSentences.length > 0 ? '未获取到字幕文件 URL，已回退为内联字幕数据' : '未获取到字幕文件 URL，SRT 将为空',
        );
      }

      const srtPath = path.join(projectDir, 'podcast-subtitles.srt');
      const originalSrtPath = path.join(projectDir, 'podcast-subtitles.original.srt');
      const srtText = subtitleJsonToSRT(subtitleSentences);
      await fs.writeFile(srtPath, srtText, 'utf-8');
      await fs.writeFile(originalSrtPath, srtText, 'utf-8');
      mainWindow?.webContents.send('tts-progress', 85);

      let durationMs = getMinimaxDurationMs(result, subtitleSentences);
      if (durationMs <= 0) {
        try {
          const metadata = await getVideoMetadata(audioPath, {
            binariesDirectory: remotionBinariesDirectory,
          });
          durationMs = Math.max(1_000, Math.round((metadata.durationInSeconds ?? 0) * 1000));
        } catch (error) {
          writeAppLog(
            'warn',
            'tts',
            '读取音频时长失败，将使用 1 秒兜底',
            error instanceof Error ? error.message : String(error),
          );
          durationMs = 1_000;
        }
      }
      mainWindow?.webContents.send('tts-progress', 100);

      return { audioPath, srtPath, durationMs };
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') {
        throw new Error('TTS 任务已取消');
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
  async (_event, args: { timeline: string; outputPath: string; exportConfig: ExportConfig }) => {
    const isDev = !app.isPackaged;
    const renderLogPrefix = '[render-video]';
    const renderStartedAt = Date.now();
    const timestamp = () => `${((Date.now() - renderStartedAt) / 1000).toFixed(2)}s`;

    const timelineData = JSON.parse(args.timeline) as TimelineData;
    const srtContent = await fs.readFile(timelineData.podcast.srtPath, 'utf-8');
    const srtEntries = parseSrt(srtContent);
    const renderConfig = buildExportRenderConfig({
      timelineWidth: timelineData.width,
      timelineHeight: timelineData.height,
      resolution: args.exportConfig.resolution,
      quality: args.exportConfig.quality,
    });

    const cpuCount = os.cpus().length;
    // 显式把并发拉满到物理核数；null = Remotion 默认策略（约 cpuCount/2）
    const explicitConcurrency = cpuCount;

    if (isDev) {
      console.log(`${renderLogPrefix} 开始导出`, {
        outputPath: args.outputPath,
        resolution: args.exportConfig.resolution,
        quality: args.exportConfig.quality,
        renderWidth: renderConfig.renderWidth,
        renderHeight: renderConfig.renderHeight,
        x264Preset: renderConfig.x264Preset,
        videoBitrate: renderConfig.videoBitrate,
        audioBitrate: renderConfig.audioBitrate,
        cpuCount,
        explicitConcurrency,
        platform: process.platform,
        arch: process.arch,
      });
    }

    const bundlePrepStart = Date.now();
    const preparedBundle = await prepareRenderBundle(timelineData);
    const {
      timeline: renderTimeline,
      serveUrl,
      cleanup: cleanupBundle,
      isPrebuilt,
    } = preparedBundle;

    if (isDev) {
      console.log(
        `${renderLogPrefix} bundle 准备完成 mode=${isPrebuilt ? 'prebuilt' : 'runtime'} 耗时=${(
          (Date.now() - bundlePrepStart) / 1000
        ).toFixed(2)}s @${timestamp()}`,
      );
    }

    try {
      const inputProps = {
        timeline: renderTimeline,
        srtEntries,
        renderConfig,
      };
      const selectStart = Date.now();
      const composition = await selectComposition({
        serveUrl,
        id: 'PodcastComposition',
        inputProps,
        binariesDirectory: remotionBinariesDirectory,
      });
      if (isDev) {
        console.log(
          `${renderLogPrefix} selectComposition 完成 耗时=${((Date.now() - selectStart) / 1000).toFixed(2)}s durationInFrames=${composition.durationInFrames} fps=${composition.fps} ${composition.width}x${composition.height} @${timestamp()}`,
        );
      }

      const renderStart = Date.now();
      let lastProgressLog = 0;
      let firstFrameAt: number | null = null;
      let lastFrameRenderAt: number | null = null;
      let lastRenderedFrames = 0;
      await renderMedia({
        serveUrl,
        composition,
        codec: 'h264',
        outputLocation: args.outputPath,
        inputProps,
        binariesDirectory: remotionBinariesDirectory,
        concurrency: explicitConcurrency,
        x264Preset: renderConfig.x264Preset,
        videoBitrate: renderConfig.videoBitrate,
        audioBitrate: renderConfig.audioBitrate as `${number}k` | `${number}K` | `${number}M`,
        ...(isDev
          ? {
              logLevel: 'verbose' as const,
              onBrowserLog: (log) => {
                // 跳过 OffthreadVideo / delayRender 的噪声 log，只保留 warning/error
                if (log.type === 'warning' || log.type === 'error') {
                  console.log(`${renderLogPrefix}[chromium:${log.type}]`, log.text);
                }
              },
            }
          : {}),
        onProgress: ({ progress, renderedFrames, encodedFrames, stitchStage }) => {
          mainWindow?.webContents.send('render-progress', progress);
          if (isDev) {
            const now = Date.now();
            if (firstFrameAt === null && renderedFrames > 0) {
              firstFrameAt = now;
            }
            // 记录帧渲染阶段的结束时刻（最后一帧被渲染完）
            if (
              renderedFrames > lastRenderedFrames &&
              renderedFrames >= composition.durationInFrames
            ) {
              lastFrameRenderAt = now;
            }
            lastRenderedFrames = renderedFrames;

            if (now - lastProgressLog > 2000 || progress >= 1) {
              lastProgressLog = now;
              const elapsedTotal = (now - renderStart) / 1000;
              // 纯帧渲染阶段的 fps（排除初始化时间）
              const renderPhaseMs = firstFrameAt ? now - firstFrameAt : 0;
              const pureRenderFps =
                renderedFrames && renderPhaseMs > 0
                  ? (renderedFrames / (renderPhaseMs / 1000)).toFixed(1)
                  : '0.0';
              console.log(
                `${renderLogPrefix} progress=${(progress * 100).toFixed(1)}% rendered=${renderedFrames}/${composition.durationInFrames} encoded=${encodedFrames} stage=${stitchStage} renderFps=${pureRenderFps} elapsed=${elapsedTotal.toFixed(2)}s`,
              );
            }
          }
        },
      });

      if (isDev) {
        const renderMediaMs = Date.now() - renderStart;
        const framePhaseMs =
          firstFrameAt && lastFrameRenderAt ? lastFrameRenderAt - firstFrameAt : null;
        const stitchingMs =
          lastFrameRenderAt !== null ? Date.now() - lastFrameRenderAt : null;
        const pureFps =
          framePhaseMs && composition.durationInFrames
            ? (composition.durationInFrames / (framePhaseMs / 1000)).toFixed(2)
            : 'n/a';
        console.log(
          `${renderLogPrefix} renderMedia 完成 总耗时=${(renderMediaMs / 1000).toFixed(2)}s`,
          {
            framePhaseS: framePhaseMs ? (framePhaseMs / 1000).toFixed(2) : 'n/a',
            stitchingS: stitchingMs ? (stitchingMs / 1000).toFixed(2) : 'n/a',
            pureRenderFps: pureFps,
            concurrency: explicitConcurrency,
            cpuCount,
          },
        );
      }

      return { outputPath: args.outputPath };
    } catch (err) {
      if (isDev) {
        console.error(`${renderLogPrefix} 导出失败 @${timestamp()}`, err);
      }
      throw err;
    } finally {
      await cleanupBundle();
    }
  },
);

ipcMain.handle('save-cover-edit', async (_event, args) => {
  return saveCoverEdit(args);
});

ipcMain.handle('list-system-fonts', async () => {
  return listSystemFonts();
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

function ensureRemotionCwdForPackagedApp() {
  if (!app.isPackaged) {
    return;
  }
  try {
    const cacheDir = ensureRemotionDownloadsCwd({
      userDataPath: app.getPath('userData'),
      existsSync,
      mkdirSync,
      writeFileSync,
      chdir: (dir) => process.chdir(dir),
    });
    writeAppLog('info', 'remotion', 'Remotion 下载缓存目录已就绪', cacheDir);
  } catch (err) {
    writeAppLog(
      'error',
      'remotion',
      '无法切换 Remotion 下载缓存目录，视频导出可能失败',
      err instanceof Error ? err.stack || err.message : String(err),
    );
  }
}

app.whenReady().then(async () => {
  refreshAppConfig();
  // 在任何 Remotion API（renderMedia / selectComposition / getVideoMetadata）
  // 调用之前把 cwd 切到 userData 下的受控目录，避免 macOS 从 Finder 启动
  // .app 时 cwd=`/` 导致 Remotion 试图 mkdir `/.remotion` 失败。
  ensureRemotionCwdForPackagedApp();
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
  // 在 whenReady 内订阅，避免 electron-vite 开发模式下主模块 HMR 重新执行
  // 时多次叠加监听器；广播只发给 mainWindow，与其他通道（analyze-progress /
  // cover-progress / menu-action / app-log）保持一致。
  videoImportService.onProgress((snapshot) => {
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
