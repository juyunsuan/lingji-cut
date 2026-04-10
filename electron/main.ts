import { bundle } from '@remotion/bundler';
import { getVideoMetadata, renderMedia, selectComposition } from '@remotion/renderer';
import chokidar from 'chokidar';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FSWatcher } from 'chokidar';
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
import { registerConversationIpc } from './conversations/ipc';
import { registerMcpIpc } from './mcp/ipc';
import { startMcpServer, stopMcpServer } from './mcp/server';

let mainWindow: BrowserWindow | null = null;
let menuContext: MenuContext = {
  activePage: 'welcome',
  hasProject: false,
  recentProjects: [],
};
let fileWatcher: FSWatcher | null = null;
const activeTtsRequests = new Map<string, AbortController>();

interface MinimaxSubtitleWord {
  text: string;
  time_ms: number;
  duration_ms: number;
}

function assembleSRT(words: MinimaxSubtitleWord[]): string {
  if (words.length === 0) return '';

  const sentences: Array<{ words: MinimaxSubtitleWord[]; startMs: number; endMs: number }> = [];
  let current: MinimaxSubtitleWord[] = [];

  for (const word of words) {
    current.push(word);
    const isSentenceEnd =
      /[。！？….!?]$/.test(word.text.trimEnd()) || current.length >= 20;
    if (isSentenceEnd) {
      const startMs = current[0].time_ms;
      const lastWord = current[current.length - 1];
      sentences.push({
        words: current,
        startMs,
        endMs: lastWord.time_ms + lastWord.duration_ms,
      });
      current = [];
    }
  }

  if (current.length > 0) {
    const startMs = current[0].time_ms;
    const lastWord = current[current.length - 1];
    sentences.push({
      words: current,
      startMs,
      endMs: lastWord.time_ms + lastWord.duration_ms,
    });
  }

  const toSRTTime = (ms: number): string => {
    const safeMs = Math.max(0, Math.round(ms));
    const h = Math.floor(safeMs / 3_600_000);
    const m = Math.floor((safeMs % 3_600_000) / 60_000);
    const s = Math.floor((safeMs % 60_000) / 1_000);
    const mil = safeMs % 1_000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(mil).padStart(3, '0')}`;
  };

  return `${sentences
    .map((sentence, index) => {
      const text = sentence.words.map((w) => w.text).join('');
      return `${index + 1}\n${toSRTTime(sentence.startMs)} --> ${toSRTTime(sentence.endMs)}\n${text}`;
    })
    .join('\n\n')}\n`;
}

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

ipcMain.handle('get-audio-duration', async (_event, filePath: string) => {
  const metadata = await getVideoMetadata(filePath);
  return Math.max(1_000, Math.round((metadata.durationInSeconds ?? 0) * 1000));
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

ipcMain.handle('show-editor-context-menu', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const menu = Menu.buildFromTemplate([
    { label: '剪切', role: 'cut' },
    { label: '复制', role: 'copy' },
    { label: '粘贴', role: 'paste' },
    { type: 'separator' },
    { label: '全选', role: 'selectAll' },
  ]);
  menu.popup({ window: win });
});

ipcMain.handle('select-project-directory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });

  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-setup-file', async (_event, kind: 'audio' | 'srt') => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters:
      kind === 'audio'
        ? [{ name: 'MP3 Audio', extensions: ['mp3'] }]
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
        ? [{ name: 'MP3 Audio', extensions: ['mp3'] }]
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

      if (assetType === 'video') {
        try {
          const metadata = await getVideoMetadata(fullPath);
          durationMs = Math.max(1000, Math.round((metadata.durationInSeconds ?? 10) * 1000));
        } catch {
          durationMs = 10000;
        }
      }

      results.push({ path: fullPath, type: assetType, durationMs });
    }
  }

  await scanDir(projectDir, 0);
  return results;
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

ipcMain.handle('start-watching', async (_event, dir: string) => {
  await fileWatcher?.close();

  fileWatcher = chokidar.watch(dir, {
    depth: 1,
    ignoreInitial: true,
    ignored: /(^|[/\\])\../,
  });

  fileWatcher.on('change', async (filePath: string) => {
    const relative = path.relative(dir, filePath);
    if (!relative.endsWith('.md')) return;

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

      if (entry.isDirectory() && currentDepth < 1) {
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

ipcMain.handle('select-output-path', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'podcast-export.mp4',
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
      apiKey: string;
      groupId: string;
      projectDir: string;
    },
  ) => {
    const { requestId, text, voiceId, speed, apiKey, groupId, projectDir } = args;
    const controller = new AbortController();
    activeTtsRequests.set(requestId, controller);
    mainWindow?.webContents.send('tts-progress', 0);

    try {
      const response = await fetch('https://api.minimax.chat/v1/t2a_pro', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          GroupId: groupId,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'speech-01-turbo',
          text,
          stream: true,
          voice_setting: { voice_id: voiceId, speed, pitch: 0 },
          audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3' },
          subtitle_enable: true,
          language_boost: 'zh',
        }),
      });

      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => String(response.status));
        throw new Error(`MiniMax TTS 请求失败: ${errText}`);
      }

      const audioChunks: Buffer[] = [];
      let subtitleWords: MinimaxSubtitleWord[] = [];
      let receivedChunks = 0;
      let estimatedTotal = 50;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr) as {
              data?: {
                audio?: string;
                status?: number;
                subtitle?: { subtitles?: MinimaxSubtitleWord[] };
              };
            };

            const audioBase64 = parsed?.data?.audio;
            const status = parsed?.data?.status;

            if (audioBase64) {
              audioChunks.push(Buffer.from(audioBase64, 'base64'));
              receivedChunks += 1;
            }

            if (status === 2 && Array.isArray(parsed?.data?.subtitle?.subtitles)) {
              subtitleWords = parsed.data.subtitle.subtitles;
              estimatedTotal = Math.max(estimatedTotal, receivedChunks);
            }

            if (status === 1) {
              estimatedTotal = Math.max(estimatedTotal, receivedChunks + 3);
            }

            const pct = Math.round(Math.min(90, (receivedChunks / estimatedTotal) * 90));
            mainWindow?.webContents.send('tts-progress', pct);
          } catch {
            // 忽略单行 SSE 解析异常，继续消费后续块
          }
        }
      }

      await fs.mkdir(projectDir, { recursive: true });

      const audioPath = path.join(projectDir, 'podcast-audio.mp3');
      const audioBuffer = Buffer.concat(audioChunks);
      await fs.writeFile(audioPath, audioBuffer);

      const srtPath = path.join(projectDir, 'podcast-subtitles.srt');
      const srtContent = assembleSRT(subtitleWords);
      await fs.writeFile(srtPath, srtContent, 'utf-8');

      const lastWord = subtitleWords[subtitleWords.length - 1];
      const durationMs = lastWord ? lastWord.time_ms + lastWord.duration_ms : 0;
      mainWindow?.webContents.send('tts-progress', 100);

      return { audioPath, srtPath, durationMs };
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') {
        throw new Error('TTS 任务已取消');
      }
      throw error;
    } finally {
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
        audioBitrate: renderConfig.audioBitrate as `${number}k` | `${number}K` | `${number}M`,
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
registerConversationIpc(() => mainWindow);
registerMcpIpc(() => mainWindow);

app.whenReady().then(async () => {
  createWindow();
  // 启动 MCP Server
  try {
    await startMcpServer(19820, () => mainWindow);
  } catch (err) {
    console.error('[MCP] Failed to start server:', err);
  }
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
