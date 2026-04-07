import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AppLogEntry } from '../src/lib/app-log';
import type { MenuContext, MenuEvent, ProjectMetadata } from '../src/lib/electron-api';
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
  getProjectMetadata: (projectDir: string) =>
    ipcRenderer.invoke('get-project-metadata', projectDir) as Promise<ProjectMetadata>,
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
  onMenuAction: (callback: (event: MenuEvent) => void) => {
    const handler = (_event: unknown, event: MenuEvent) => callback(event);
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
  saveScriptFile: (projectDir: string, filename: string, content: string) =>
    ipcRenderer.invoke('save-script-file', projectDir, filename, content),
  loadScriptFile: (projectDir: string, filename: string) =>
    ipcRenderer.invoke('load-script-file', projectDir, filename),
  saveScriptState: (projectDir: string, state: string) =>
    ipcRenderer.invoke('save-script-state', projectDir, state),
  loadScriptState: (projectDir: string) =>
    ipcRenderer.invoke('load-script-state', projectDir),
  selectTextFile: () =>
    ipcRenderer.invoke('select-text-file') as Promise<{ path: string; content: string } | null>,
  setMenuContext: (context: MenuContext) => ipcRenderer.invoke('set-menu-context', context),
  selectOutputPath: () => ipcRenderer.invoke('select-output-path'),
});

// ─── Agent API ────────────────────────────────────────────

contextBridge.exposeInMainWorld('agentAPI', {
  connect: (projectDir: string) => ipcRenderer.invoke('agent:connect', projectDir),
  disconnect: () => ipcRenderer.invoke('agent:disconnect'),
  getStatus: () => ipcRenderer.invoke('agent:get-status') as Promise<string>,
  sendPrompt: (contents: unknown[]) => ipcRenderer.invoke('agent:send-prompt', contents),
  cancelTurn: () => ipcRenderer.invoke('agent:cancel-turn'),
  setMode: (modeId: string) => ipcRenderer.invoke('agent:set-mode', modeId),
  setConfigOption: (configId: string, valueId: string) =>
    ipcRenderer.invoke('agent:set-config-option', configId, valueId),
  respondPermission: (requestId: string, optionId: string) =>
    ipcRenderer.invoke('agent:respond-permission', requestId, optionId),

  getConfig: () => ipcRenderer.invoke('agent:get-config'),
  saveConfig: (data: unknown) => ipcRenderer.invoke('agent:save-config', data),
  getApiKey: (agentId: string) => ipcRenderer.invoke('agent:get-api-key', agentId),
  setApiKey: (agentId: string, key: string) => ipcRenderer.invoke('agent:set-api-key', agentId, key),
  getPermissionPolicy: () => ipcRenderer.invoke('agent:get-permission-policy'),
  setPermissionPolicy: (policy: string) => ipcRenderer.invoke('agent:set-permission-policy', policy),

  runPreflight: () => ipcRenderer.invoke('agent:run-preflight'),
  installAgent: (version: string) => ipcRenderer.invoke('agent:install', version),
  uninstallAgent: () => ipcRenderer.invoke('agent:uninstall'),
  getLatestVersion: () => ipcRenderer.invoke('agent:get-latest-version'),

  onStatusChanged: (callback: (status: string) => void) => {
    const handler = (_event: unknown, status: string) => callback(status);
    ipcRenderer.on('agent:status', handler);
    return () => ipcRenderer.removeListener('agent:status', handler);
  },
  onEvent: (callback: (block: unknown) => void) => {
    const handler = (_event: unknown, block: unknown) => callback(block);
    ipcRenderer.on('agent:event', handler);
    return () => ipcRenderer.removeListener('agent:event', handler);
  },
  onCapabilities: (callback: (caps: unknown) => void) => {
    const handler = (_event: unknown, caps: unknown) => callback(caps);
    ipcRenderer.on('agent:capabilities', handler);
    return () => ipcRenderer.removeListener('agent:capabilities', handler);
  },
});
