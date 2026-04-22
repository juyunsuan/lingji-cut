import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AppLogEntry } from '../src/lib/app-log';
import type {
  FileEntry,
  MenuContext,
  MenuEvent,
  ProjectMetadata,
  WorkbenchTabContextMenuRequest,
  WorkbenchTabMenuEvent,
} from '../src/lib/electron-api';
import type { ExportConfig } from '../src/lib/export-settings';
import type { SrtEntry } from '../src/types';
import type { AICard, AISegment, AISettings, PromptBindingMap } from '../src/types/ai';
import type { ConversationAPI } from '../src/types/conversation';
import type { VideoImportRequest } from '../src/lib/video-import-types';

contextBridge.exposeInMainWorld('electronAPI', {
  parseSrtFile: (filePath: string) => ipcRenderer.invoke('parse-srt-file', filePath),
  getAudioDuration: (filePath: string) => ipcRenderer.invoke('get-audio-duration', filePath),
  analyzeSrt: (args: {
    entries?: SrtEntry[];
    srtContent?: string;
    settings: AISettings;
    globalPrompt?: string;
    projectDir?: string;
    projectBindings?: PromptBindingMap | null;
  }) =>
    ipcRenderer.invoke('analyze-srt', args),
  planStoryboard: (args: {
    entries?: SrtEntry[];
    srtContent?: string;
    settings: AISettings;
    globalPrompt?: string;
    projectBindings?: PromptBindingMap | null;
  }) => ipcRenderer.invoke('plan-storyboard', args),
  regenerateAICard: (args: {
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
  }) => ipcRenderer.invoke('regenerate-ai-card', args),
  regenerateCoverPrompt: (args: {
    entries: SrtEntry[];
    settings: AISettings;
    globalPrompt?: string;
    currentPrompt?: string;
    projectDir?: string;
    projectBindings?: PromptBindingMap | null;
  }) => ipcRenderer.invoke('regenerate-cover-prompt', args),
  generateCoverImages: (args: {
    prompts: string[];
    settings: AISettings;
    projectDir: string;
    projectBindings?: PromptBindingMap | null;
  }) => ipcRenderer.invoke('generate-cover-images', args),
  saveCoverEdit: (args: import('../src/lib/cover-editor/contracts').SaveCoverEditArgs) =>
    ipcRenderer.invoke('save-cover-edit', args),
  listSystemFonts: () =>
    ipcRenderer.invoke('list-system-fonts') as Promise<
      import('../src/lib/cover-editor/contracts').ListSystemFontsResult
    >,
  saveTimeline: (projectDir: string, data: string) =>
    ipcRenderer.invoke('save-timeline', projectDir, data),
  loadTimeline: (projectDir: string) => ipcRenderer.invoke('load-timeline', projectDir),
  saveAIAnalysis: (projectDir: string, data: string) =>
    ipcRenderer.invoke('save-ai-analysis', projectDir, data),
  loadAIAnalysis: (projectDir: string) => ipcRenderer.invoke('load-ai-analysis', projectDir),
  loadProject: (projectDir: string) =>
    ipcRenderer.invoke('load-project', projectDir),
  saveProjectSection: (projectDir: string, section: string, data: string) =>
    ipcRenderer.invoke('save-project-section', projectDir, section, data),
  scanProjectDirectory: (projectDir: string) =>
    ipcRenderer.invoke('scan-project-directory', projectDir),
  importProject: (args: { projectDir: string; acceptMissingAssets: boolean }) =>
    ipcRenderer.invoke('import-project', args),
  getInitialGlobalSettings: () =>
    ipcRenderer.sendSync('load-global-settings-sync') as string | null,
  loadGlobalSettings: () =>
    ipcRenderer.invoke('load-global-settings'),
  saveGlobalSettings: (data: string) =>
    ipcRenderer.invoke('save-global-settings', data),
  exportConfigBackup: () =>
    ipcRenderer.invoke('config-backup:export') as Promise<
      { canceled: true } | { canceled: false; filePath: string }
    >,
  previewConfigBackup: () =>
    ipcRenderer.invoke('config-backup:preview') as Promise<
      | { canceled: true }
      | {
          canceled: false;
          filePath: string;
          schemaVersion: string;
          exportedAt: string;
          appVersion: string;
          platform: string;
        }
    >,
  importConfigBackup: (args: { filePath: string }) =>
    ipcRenderer.invoke('config-backup:import', args) as Promise<{
      appliedFrom: string;
      settingsBackupPath: string;
      agentBackupPath?: string;
    }>,
  getProjectMetadata: (projectDir: string) =>
    ipcRenderer.invoke('get-project-metadata', projectDir) as Promise<ProjectMetadata>,
  selectProjectDirectory: () => ipcRenderer.invoke('select-project-directory'),
  selectSetupFile: (kind: 'audio' | 'srt') => ipcRenderer.invoke('select-setup-file', kind),
  selectMediaFile: (kind: 'audio' | 'srt') => ipcRenderer.invoke('select-media-file', kind),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  addAsset: () => ipcRenderer.invoke('add-asset'),
  scanProjectAssets: (projectDir: string) =>
    ipcRenderer.invoke('scan-project-assets', projectDir) as Promise<
      { path: string; type: 'video' | 'image' | 'audio' | 'srt'; durationMs: number }[]
    >,
  scanImportDirectory: (dir: string) =>
    ipcRenderer.invoke('scan-import-directory', dir) as Promise<{
      audioFiles: string[];
      srtFiles: string[];
    }>,
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
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
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
  selectHtmlFile: () =>
    ipcRenderer.invoke('select-html-file') as Promise<{ path: string; content: string } | null>,
  // 轻量级抖音链接解析：仅返回标题和视频 ID
  resolveDouyinUrl: (url: string) =>
    ipcRenderer.invoke('resolve-douyin-url', url) as Promise<{ title: string; videoId: string }>,
  importVideoSource: (request: VideoImportRequest) =>
    ipcRenderer.invoke('import-video-source', request),
  getVideoImportStatus: (importId: string) =>
    ipcRenderer.invoke('get-video-import-status', importId),
  startWatching: (dir: string) => ipcRenderer.invoke('start-watching', dir),
  stopWatching: () => ipcRenderer.invoke('stop-watching'),
  onFileChanged: (callback: (data: { file: string; content: string }) => void) => {
    const handler = (_event: unknown, data: { file: string; content: string }) => callback(data);
    ipcRenderer.on('file-changed', handler);
    return () => ipcRenderer.removeListener('file-changed', handler);
  },
  onFileTreeChanged: (callback: (data: { type: string; file: string }) => void) => {
    const handler = (_event: unknown, data: { type: string; file: string }) => callback(data);
    ipcRenderer.on('file-tree-changed', handler);
    return () => ipcRenderer.removeListener('file-tree-changed', handler);
  },
  readDirectory: (dir: string) =>
    ipcRenderer.invoke('read-directory', dir) as Promise<FileEntry[]>,
  setMenuContext: (context: MenuContext) => ipcRenderer.invoke('set-menu-context', context),
  generateTTS: (args: {
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
  }) => ipcRenderer.invoke('generate-tts', args),
  onTTSProgress: (callback: (pct: number) => void) => {
    const handler = (_event: unknown, pct: number) => callback(pct);
    ipcRenderer.on('tts-progress', handler);
    return () => ipcRenderer.removeListener('tts-progress', handler);
  },
  cancelTTS: (requestId: string) => ipcRenderer.invoke('cancel-tts', requestId),
  selectOutputPath: (defaultPath?: string) =>
    ipcRenderer.invoke('select-output-path', defaultPath),
  showEditorContextMenu: () => ipcRenderer.invoke('show-editor-context-menu'),
  showWorkbenchTabContextMenu: (request: WorkbenchTabContextMenuRequest) =>
    ipcRenderer.invoke('show-workbench-tab-context-menu', request),
  onWorkbenchTabMenuAction: (callback: (event: WorkbenchTabMenuEvent) => void) => {
    const handler = (_event: unknown, payload: WorkbenchTabMenuEvent) => callback(payload);
    ipcRenderer.on('workbench-tab-menu-action', handler);
    return () => ipcRenderer.removeListener('workbench-tab-menu-action', handler);
  },
  loadRecentProjects: () => ipcRenderer.invoke('load-recent-projects'),
  addRecentProject: (projectDir: string, projectName?: string) =>
    ipcRenderer.invoke('add-recent-project', projectDir, projectName),
  removeRecentProject: (projectDir: string) =>
    ipcRenderer.invoke('remove-recent-project', projectDir),
  refreshRecentProjects: () => ipcRenderer.invoke('refresh-recent-projects'),

  // ─── 提示词配置 ─────────────────────────────────────
  listPrompts: (args: { projectDir?: string } = {}) =>
    ipcRenderer.invoke('prompts:list', args),
  listPromptKinds: () => ipcRenderer.invoke('prompts:kinds'),
  readPrompt: (args: { kind: string; scope: 'builtin' | 'global' | 'project'; projectDir?: string }) =>
    ipcRenderer.invoke('prompts:read', args),
  readEffectivePrompt: (args: { kind: string; projectDir?: string }) =>
    ipcRenderer.invoke('prompts:read-effective', args),
  writePrompt: (args: {
    kind: string;
    scope: 'global' | 'project';
    content: string;
    projectDir?: string;
  }) => ipcRenderer.invoke('prompts:write', args),
  deletePrompt: (args: { kind: string; scope: 'global' | 'project'; projectDir?: string }) =>
    ipcRenderer.invoke('prompts:delete', args),
  getDefaultPrompt: (args: { kind: string }) =>
    ipcRenderer.invoke('prompts:default', args),
  readPromptBindings: (scope: 'project', projectDir: string) =>
    ipcRenderer.invoke('prompts:readBindings', { scope, projectDir }),
  writePromptBindings: (scope: 'project', bindings: unknown, projectDir: string) =>
    ipcRenderer.invoke('prompts:writeBindings', { scope, bindings, projectDir }),

  // ─── 用户自定义提示词条目（script-template 等分类） ──────
  listUserPromptCategories: () => ipcRenderer.invoke('user-prompts:categories'),
  listUserPrompts: (category: string) =>
    ipcRenderer.invoke('user-prompts:list', { category }),
  readUserPrompt: (category: string, id: string) =>
    ipcRenderer.invoke('user-prompts:read', { category, id }),
  writeUserPrompt: (input: {
    category: string;
    id: string;
    name: string;
    description: string;
    version?: number;
    system: string;
    user: string;
  }) => ipcRenderer.invoke('user-prompts:write', input),
  deleteUserPrompt: (category: string, id: string) =>
    ipcRenderer.invoke('user-prompts:delete', { category, id }),
  getUserPromptSeed: (category: string, id: string) =>
    ipcRenderer.invoke('user-prompts:seed', { category, id }),
});

// ─── Agent API ────────────────────────────────────────────

contextBridge.exposeInMainWorld('agentAPI', {
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

  connectRuntime: (input: { conversationId: number; projectDir: string; sessionId?: string | null; agentType?: string }) =>
    ipcRenderer.invoke('agent:connect-runtime', input),
  disconnectRuntime: (conversationId: number) => ipcRenderer.invoke('agent:disconnect-runtime', conversationId),
  sendPromptToConversation: (conversationId: number, contents: unknown[]) =>
    ipcRenderer.invoke('agent:send-prompt-runtime', conversationId, contents),
  cancelConversationTurn: (conversationId: number) =>
    ipcRenderer.invoke('agent:cancel-turn-runtime', conversationId),
  setConversationMode: (conversationId: number, modeId: string) =>
    ipcRenderer.invoke('agent:set-mode-runtime', conversationId, modeId),
  setConversationConfigOption: (conversationId: number, configId: string, valueId: string) =>
    ipcRenderer.invoke('agent:set-config-option-runtime', conversationId, configId, valueId),
  respondConversationPermission: (conversationId: number, requestId: string, optionId: string) =>
    ipcRenderer.invoke('agent:respond-permission-runtime', conversationId, requestId, optionId),
  onRuntimeStatusChanged: (callback: (payload: { conversationId: number; status: string }) => void) => {
    const handler = (_event: unknown, payload: { conversationId: number; status: string }) => callback(payload);
    ipcRenderer.on('agent:runtime-status', handler);
    return () => ipcRenderer.removeListener('agent:runtime-status', handler);
  },
  onRuntimeEvent: (callback: (payload: { conversationId: number; event: unknown }) => void) => {
    const handler = (_event: unknown, payload: { conversationId: number; event: unknown }) => callback(payload);
    ipcRenderer.on('agent:runtime-event', handler);
    return () => ipcRenderer.removeListener('agent:runtime-event', handler);
  },
  onRuntimeCapabilities: (callback: (payload: { conversationId: number; capabilities: unknown }) => void) => {
    const handler = (_event: unknown, payload: { conversationId: number; capabilities: unknown }) => callback(payload);
    ipcRenderer.on('agent:runtime-capabilities', handler);
    return () => ipcRenderer.removeListener('agent:runtime-capabilities', handler);
  },
});

contextBridge.exposeInMainWorld('conversationAPI', {
  list: (projectId: string) => ipcRenderer.invoke('conversation:list', projectId),
  detail: (conversationId: number, projectId?: string) => {
    if (!projectId) {
      throw new Error('conversationAPI.detail requires projectId');
    }
    return ipcRenderer.invoke('conversation:detail', projectId, conversationId);
  },
  create: (input: { projectId: string; agentType: string; title?: string }) =>
    ipcRenderer.invoke('conversation:create', input),
  fork: (sourceConversationId: number, projectId?: string, title?: string) => {
    if (!projectId) {
      throw new Error('conversationAPI.fork requires projectId');
    }
    return ipcRenderer.invoke('conversation:fork', projectId, sourceConversationId, title);
  },
  update: (
    conversationId: number,
    patch: {
      title?: string;
      status?: string;
      externalId?: string | null;
      sessionStatsJson?: string | null;
      messageCount?: number;
    },
    projectId?: string,
  ) => {
    if (!projectId) {
      throw new Error('conversationAPI.update requires projectId');
    }
    return ipcRenderer.invoke('conversation:update', projectId, conversationId, patch);
  },
  delete: (conversationId: number, projectId?: string) => {
    if (!projectId) {
      throw new Error('conversationAPI.delete requires projectId');
    }
    return ipcRenderer.invoke('conversation:delete', projectId, conversationId);
  },
  open: (projectId: string, conversationId: number) => {
    if (!projectId) {
      throw new Error('conversationAPI.open requires projectId');
    }
    return ipcRenderer.invoke('conversation:open', projectId, conversationId);
  },
  appendTurn: (
    conversationId: number,
    input: { role: string; blocks: unknown[]; sessionStatsJson?: string | null },
    projectId?: string,
  ) => {
    if (!projectId) {
      throw new Error('conversationAPI.appendTurn requires projectId');
    }
    return ipcRenderer.invoke('conversation:append-turn', projectId, conversationId, input);
  },
  getOpenedConversation: (projectId: string) => ipcRenderer.invoke('conversation:get-opened', projectId),
  setOpenedConversation: (projectId: string, conversationId: number | null) =>
    ipcRenderer.invoke('conversation:set-opened', projectId, conversationId),
} satisfies ConversationAPI);

// ─── MCP API ─────────────────────────────────────────────

contextBridge.exposeInMainWorld('mcpAPI', {
  // 服务管理
  getStatus: () => ipcRenderer.invoke('mcp:get-status'),
  start: (port: number) => ipcRenderer.invoke('mcp:start', port),
  stop: () => ipcRenderer.invoke('mcp:stop'),

  // 配置管理
  scanLocal: () => ipcRenderer.invoke('mcp:scan-local'),
  registerToApp: (app: string) => ipcRenderer.invoke('mcp:register-to-app', app),
  removeFromApp: (app: string) => ipcRenderer.invoke('mcp:remove-from-app', app),
  isRegistered: (app: string) => ipcRenderer.invoke('mcp:is-registered', app),

  // MCP Tool 事件监听（Main → Renderer）
  onGetEditorState: (handler: (payload: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown) => handler(payload);
    ipcRenderer.on('mcp:get-editor-state', listener);
    return () => ipcRenderer.removeListener('mcp:get-editor-state', listener);
  },
  onReadScript: (handler: (payload: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown) => handler(payload);
    ipcRenderer.on('mcp:read-script', listener);
    return () => ipcRenderer.removeListener('mcp:read-script', listener);
  },
  onGenerateScript: (handler: (payload: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown) => handler(payload);
    ipcRenderer.on('mcp:generate-script', listener);
    return () => ipcRenderer.removeListener('mcp:generate-script', listener);
  },
  onUpdateScript: (handler: (payload: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown) => handler(payload);
    ipcRenderer.on('mcp:update-script', listener);
    return () => ipcRenderer.removeListener('mcp:update-script', listener);
  },
  onSubmitReview: (handler: (payload: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown) => handler(payload);
    ipcRenderer.on('mcp:submit-review', listener);
    return () => ipcRenderer.removeListener('mcp:submit-review', listener);
  },
  onListProjectFiles: (handler: (payload: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown) => handler(payload);
    ipcRenderer.on('mcp:list-project-files', listener);
    return () => ipcRenderer.removeListener('mcp:list-project-files', listener);
  },
  onGetProjectContext: (handler: (payload: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown) => handler(payload);
    ipcRenderer.on('mcp:get-project-context', listener);
    return () => ipcRenderer.removeListener('mcp:get-project-context', listener);
  },

  // MCP 日志监听（Main → Renderer）
  onLog: (handler: (data: { level: string; message: string }) => void) => {
    const listener = (_event: unknown, data: { level: string; message: string }) => handler(data);
    ipcRenderer.on('mcp:log', listener);
    return () => ipcRenderer.removeListener('mcp:log', listener);
  },

  // 回复辅助（Renderer → Main）
  reply: (replyChannel: string, data: unknown) => ipcRenderer.invoke(replyChannel, data),
});

// ─── Script History API ───────────────────────────────

contextBridge.exposeInMainWorld('scriptHistoryAPI', {
  create: (input: {
    projectId: string;
    fileName: string;
    content: string;
    source: string;
    providerId?: string | null;
    providerName?: string | null;
    modelName?: string | null;
  }) => ipcRenderer.invoke('script-history:create', input),
  list: (projectId: string, fileName: string, opts?: {
    sourceFilter?: string[];
    limit?: number;
    offset?: number;
  }) => ipcRenderer.invoke('script-history:list', projectId, fileName, opts),
  get: (projectId: string, versionId: number) =>
    ipcRenderer.invoke('script-history:get', projectId, versionId),
  rollback: (versionId: number, currentContent: string, projectId: string, fileName: string) =>
    ipcRenderer.invoke('script-history:rollback', versionId, currentContent, projectId, fileName),
  updateLabel: (projectId: string, versionId: number, label: string | null) =>
    ipcRenderer.invoke('script-history:update-label', projectId, versionId, label),
  delete: (projectId: string, versionId: number) =>
    ipcRenderer.invoke('script-history:delete', projectId, versionId),
});
