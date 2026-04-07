import { bundle } from '@remotion/bundler';
import { getVideoMetadata, renderMedia, selectComposition } from '@remotion/renderer';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { MenuContext, MenuEvent, ProjectMetadata } from '../src/lib/electron-api';
import { addAppLog, getAppLogFilePath, getAppLogs } from './app-logger';
import { analyzeSrt, regenerateAICard, regenerateCoverPrompt } from '../src/lib/ai-analysis';
import { buildExportRenderConfig, type ExportConfig } from '../src/lib/export-settings';
import { generateCoverCandidates } from '../src/lib/jimeng-client';
import { prepareTimelineForRemotionRender, type RenderAssetDescriptor } from '../src/lib/remotion-assets';
import type { PersistedAIState } from '../src/lib/ai-persistence';
import { parseSrt } from '../src/lib/srt-parser';
import type { SrtEntry, TimelineData } from '../src/types';
import type { AICard, AISettings } from '../src/types/ai';
import { createApplicationMenuTemplate } from './app-menu';
import { toRendererConsoleLog } from './console-message';
import { materializePersistedAIState, materializeTimelineWebCards } from './web-card-storage';
import { registerAgentIpc } from './acp/ipc';

let mainWindow: BrowserWindow | null = null;
let menuContext: MenuContext = {
  activePage: 'welcome',
  hasProject: false,
  recentProjects: [],
};

function sendMenuEvent(event: MenuEvent) {
  mainWindow?.webContents.send('menu-action', event);
}

function writeAppLog(level: 'info' | 'warn' | 'error', scope: string, message: string, details?: string) {
  const entry = addAppLog(level, scope, message, details);
  mainWindow?.webContents.send('app-log', entry);
}

function createApplicationMenu() {
  return Menu.buildFromTemplate(
    createApplicationMenuTemplate(sendMenuEvent, {
      ...menuContext,
      isDevelopment: !app.isPackaged,
    }),
  );
}

function refreshApplicationMenu() {
  Menu.setApplicationMenu(createApplicationMenu());
}

function createWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: '#070b14',
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

ipcMain.handle(
  'analyze-srt',
  async (
    _event,
    args: { entries?: SrtEntry[]; srtContent?: string; settings: AISettings; globalPrompt?: string },
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
      const result = await analyzeSrt(entries, args.settings, {
        globalPrompt: args.globalPrompt,
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
  'regenerate-ai-card',
  async (
    _event,
    args: {
      entries: SrtEntry[];
      card: AICard;
      settings: AISettings;
      globalPrompt?: string;
      cardPrompt?: string;
    },
  ) => {
    writeAppLog(
      'info',
      'ai-analysis',
      '收到单卡重生成请求',
      `cardId=${args.card.id}, entries=${args.entries.length}`,
    );

    try {
      return await regenerateAICard(args.entries, args.card, args.settings, {
        globalPrompt: args.globalPrompt,
        cardPrompt: args.cardPrompt,
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
    },
  ) => {
    writeAppLog(
      'info',
      'ai-analysis',
      '收到封面提示词重生成请求',
      `entries=${args.entries.length}, hasCurrentPrompt=${Boolean(args.currentPrompt)}`,
    );

    try {
      return await regenerateCoverPrompt(args.entries, args.settings, {
        globalPrompt: args.globalPrompt,
        currentPrompt: args.currentPrompt,
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
  async (_event, args: { prompts: string[]; settings: AISettings; projectDir: string }) => {
    const coversDir = path.join(args.projectDir, 'covers');
    return generateCoverCandidates(args.prompts, args.settings, coversDir);
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
  };

  refreshApplicationMenu();
});

ipcMain.handle('select-project-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });

  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-setup-file', async (_event, kind: 'audio' | 'srt') => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters:
      kind === 'audio'
        ? [{ name: 'MP3 Audio', extensions: ['mp3'] }]
        : [{ name: 'SRT Subtitle', extensions: ['srt'] }],
  });

  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-media-file', async (_event, kind: 'audio' | 'srt') => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters:
      kind === 'audio'
        ? [{ name: 'MP3 Audio', extensions: ['mp3'] }]
        : [{ name: 'SRT Subtitle', extensions: ['srt'] }],
  });

  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('add-asset', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      {
        name: '媒体素材',
        extensions: ['mp4', 'mov', 'webm', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp'],
      },
    ],
  });

  if (result.canceled) {
    return null;
  }

  const assetPath = result.filePaths[0];
  const extension = path.extname(assetPath).toLowerCase();
  const isVideo = ['.mp4', '.mov', '.webm', '.m4v'].includes(extension);
  let durationMs = 5000;

  if (isVideo) {
    try {
      const metadata = await getVideoMetadata(assetPath);
      durationMs = Math.max(1000, Math.round((metadata.durationInSeconds ?? 10) * 1000));
    } catch {
      durationMs = 10000;
    }
  }

  return {
    path: assetPath,
    type: isVideo ? 'video' : 'image',
    durationMs,
  };
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

ipcMain.handle('select-output-path', async () => {
  const result = await dialog.showSaveDialog({
    defaultPath: 'podcast-export.mp4',
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });

  return result.canceled ? null : result.filePath;
});

ipcMain.handle('get-app-logs', () => getAppLogs());

ipcMain.handle('get-app-log-file-path', () => getAppLogFilePath());

ipcMain.handle('toggle-devtools', () => {
  if (!mainWindow) {
    return;
  }

  mainWindow.webContents.toggleDevTools();
});

ipcMain.on('show-item-in-folder', (_event, filePath: string) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle(
  'render-video',
  async (_event, args: { timeline: string; outputPath: string; exportConfig: ExportConfig }) => {
    const timelineData = JSON.parse(args.timeline) as TimelineData;
    const srtContent = await fs.readFile(timelineData.podcast.srtPath, 'utf-8');
    const srtEntries = parseSrt(srtContent);
    const { timeline: renderTimeline, publicDir } = await createRenderPublicDir(timelineData);
    const renderConfig = buildExportRenderConfig({
      timelineWidth: timelineData.width,
      timelineHeight: timelineData.height,
      resolution: args.exportConfig.resolution,
      quality: args.exportConfig.quality,
    });

    try {
      const serveUrl = await bundle({
        entryPoint: resolveCompositionEntryPath(),
        publicDir,
      });
      const inputProps = {
        timeline: renderTimeline,
        srtEntries,
        renderConfig,
      };
      const composition = await selectComposition({
        serveUrl,
        id: 'PodcastComposition',
        inputProps,
      });

      await renderMedia({
        serveUrl,
        composition,
        codec: 'h264',
        outputLocation: args.outputPath,
        inputProps,
        x264Preset: renderConfig.x264Preset,
        videoBitrate: renderConfig.videoBitrate,
        audioBitrate: renderConfig.audioBitrate,
        onProgress: ({ progress }) => {
          mainWindow?.webContents.send('render-progress', progress);
        },
      });

      return { outputPath: args.outputPath };
    } finally {
      await fs.rm(publicDir, { recursive: true, force: true });
    }
  },
);

// 开发模式下让 Ctrl+C 能正常退出 Electron
if (process.env.NODE_ENV_ELECTRON_VITE === 'development') {
  process.on('SIGINT', () => app.quit());
  process.on('SIGTERM', () => app.quit());
}

registerAgentIpc(() => mainWindow);

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
