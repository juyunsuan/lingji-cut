import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AppLogEntry } from '../src/lib/app-log';
import type { MenuAction } from '../src/lib/electron-api';
import type { ExportConfig } from '../src/lib/export-settings';
import type { SrtEntry } from '../src/types';
import type { AICard, AISettings } from '../src/types/ai';

contextBridge.exposeInMainWorld('electronAPI', {
  parseSrtFile: (filePath: string) => ipcRenderer.invoke('parse-srt-file', filePath),
  analyzeSrt: (args: {
    entries?: SrtEntry[];
    srtContent?: string;
    settings: AISettings;
    globalPrompt?: string;
  }) =>
    ipcRenderer.invoke('analyze-srt', args),
  regenerateAICard: (args: {
    entries: SrtEntry[];
    card: AICard;
    settings: AISettings;
    globalPrompt?: string;
    cardPrompt?: string;
  }) => ipcRenderer.invoke('regenerate-ai-card', args),
  regenerateCoverPrompt: (args: {
    entries: SrtEntry[];
    settings: AISettings;
    globalPrompt?: string;
    currentPrompt?: string;
  }) => ipcRenderer.invoke('regenerate-cover-prompt', args),
  generateCoverImages: (args: { prompts: string[]; settings: AISettings; projectDir: string }) =>
    ipcRenderer.invoke('generate-cover-images', args),
  saveTimeline: (projectDir: string, data: string) =>
    ipcRenderer.invoke('save-timeline', projectDir, data),
  loadTimeline: (projectDir: string) => ipcRenderer.invoke('load-timeline', projectDir),
  saveAIAnalysis: (projectDir: string, data: string) =>
    ipcRenderer.invoke('save-ai-analysis', projectDir, data),
  loadAIAnalysis: (projectDir: string) => ipcRenderer.invoke('load-ai-analysis', projectDir),
  selectProjectDirectory: () => ipcRenderer.invoke('select-project-directory'),
  selectSetupFile: (kind: 'audio' | 'srt') => ipcRenderer.invoke('select-setup-file', kind),
  selectMediaFile: (kind: 'audio' | 'srt') => ipcRenderer.invoke('select-media-file', kind),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  addAsset: () => ipcRenderer.invoke('add-asset'),
  renderVideo: (args: { timeline: string; outputPath: string; exportConfig: ExportConfig }) =>
    ipcRenderer.invoke('render-video', args),
  onRenderProgress: (callback: (progress: number) => void) => {
    const handler = (_event: unknown, progress: number) => callback(progress);
    ipcRenderer.on('render-progress', handler);
    return () => ipcRenderer.removeListener('render-progress', handler);
  },
  onMenuAction: (callback: (action: MenuAction) => void) => {
    const handler = (_event: unknown, action: MenuAction) => callback(action);
    ipcRenderer.on('menu-action', handler);
    return () => ipcRenderer.removeListener('menu-action', handler);
  },
  getAppLogs: () => ipcRenderer.invoke('get-app-logs') as Promise<AppLogEntry[]>,
  getAppLogFilePath: () => ipcRenderer.invoke('get-app-log-file-path') as Promise<string>,
  onAppLog: (callback: (entry: AppLogEntry) => void) => {
    const handler = (_event: unknown, entry: AppLogEntry) => callback(entry);
    ipcRenderer.on('app-log', handler);
    return () => ipcRenderer.removeListener('app-log', handler);
  },
  toggleDevTools: () => ipcRenderer.invoke('toggle-devtools'),
  showItemInFolder: (filePath: string) => ipcRenderer.send('show-item-in-folder', filePath),
  selectOutputPath: () => ipcRenderer.invoke('select-output-path'),
});
