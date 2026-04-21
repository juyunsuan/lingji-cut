import type { ExportConfig } from './export-settings';
import type { AppLogEntry } from './app-log';
import type { SrtEntry } from '../types';
import type {
  AICard,
  AISegment,
  AISettings,
  AIStoryboardPlan,
  CoverCandidate,
  PromptBindingMap,
} from '../types/ai';
import type { ImportKind } from './import-files';
import type {
  VideoImportProgress,
  VideoImportRequest,
} from './video-import-types';
import type {
  PromptKind,
  PromptKindMeta,
  PromptScope,
  EffectivePromptTemplate,
  PromptCategory,
  PromptCategoryMeta,
  UserPromptEntry,
  UserPromptSeed,
} from './prompts';

export type AppPage = 'welcome' | 'setup' | 'editor' | 'script-workbench' | 'settings';

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  children?: FileEntry[];
}

export interface WorkbenchTabContextMenuRequest {
  file: string;
  projectDir: string | null;
  tabIndex: number;
  tabCount: number;
}

export interface WorkbenchTabMenuEvent {
  action: 'close-current' | 'close-others' | 'close-right';
  file: string;
}

export const MENU_ACTIONS = [
  'new-project',
  'open-project',
  'open-settings',
  'close-project',
  'show-project-in-folder',
  'undo',
  'redo',
  'replace-audio',
  'replace-srt',
  'add-asset',
  'export',
  'save-script',
  'go-back',
  'find',
  'find-replace',
] as const;

export type MenuAction = (typeof MENU_ACTIONS)[number];

export interface MenuRecentProject {
  path: string;
  name: string;
}

export interface MenuContext {
  activePage: AppPage;
  hasProject: boolean;
  recentProjects: MenuRecentProject[];
}

export type MenuEvent =
  | {
      type: 'command';
      action: MenuAction;
    }
  | {
      type: 'open-recent-project';
      projectDir: string;
    };

const PROJECT_REQUIRED_COMMANDS = new Set<MenuAction>([
  'close-project',
  'show-project-in-folder',
  'undo',
  'redo',
  'replace-audio',
  'replace-srt',
  'add-asset',
  'export',
]);

export function isProjectRequiredCommand(command: MenuAction): boolean {
  return PROJECT_REQUIRED_COMMANDS.has(command);
}

export interface ProjectMetadata {
  projectDir: string;
  sizeBytes: number;
  createdAtMs: number;
}

export interface RecentProjectEntry {
  path: string;
  name: string;
  lastOpenedAt: number;
  createdAt?: string;
  updatedAt?: string;
  coverImageUrl?: string;
}

export interface ElectronAPI {
  parseSrtFile: (filePath: string) => Promise<{ entries: SrtEntry[]; durationMs: number }>;
  getAudioDuration: (filePath: string) => Promise<number>;
  analyzeSrt: (args: {
    entries?: SrtEntry[];
    srtContent?: string;
    settings: AISettings;
    globalPrompt?: string;
    projectDir?: string;
    projectBindings?: PromptBindingMap | null;
  }) => Promise<unknown>;
  planStoryboard: (args: {
    entries?: SrtEntry[];
    srtContent?: string;
    settings: AISettings;
    globalPrompt?: string;
    projectBindings?: PromptBindingMap | null;
  }) => Promise<AIStoryboardPlan>;
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
  }) => Promise<AICard>;
  regenerateCoverPrompt: (args: {
    entries: SrtEntry[];
    settings: AISettings;
    globalPrompt?: string;
    currentPrompt?: string;
    projectDir?: string;
    projectBindings?: PromptBindingMap | null;
  }) => Promise<string[]>;
  generateCoverImages: (args: {
    prompts: string[];
    settings: AISettings;
    projectDir: string;
    projectBindings?: PromptBindingMap | null;
  }) => Promise<CoverCandidate[]>;
  saveCoverEdit: (
    args: import('./cover-editor/contracts').SaveCoverEditArgs,
  ) => Promise<import('./cover-editor/contracts').SaveCoverEditResult>;
  saveTimeline: (projectDir: string, data: string) => Promise<string>;
  loadTimeline: (projectDir: string) => Promise<string | null>;
  saveAIAnalysis: (projectDir: string, data: string) => Promise<string>;
  loadAIAnalysis: (projectDir: string) => Promise<string | null>;
  loadProject: (projectDir: string) => Promise<string>;
  saveProjectSection: (projectDir: string, section: string, data: string) => Promise<void>;
  getInitialGlobalSettings: () => string | null;
  loadGlobalSettings: () => Promise<string | null>;
  saveGlobalSettings: (data: string) => Promise<void>;
  getProjectMetadata: (projectDir: string) => Promise<ProjectMetadata>;
  selectProjectDirectory: () => Promise<string | null>;
  selectSetupFile: (kind: ImportKind) => Promise<string | null>;
  selectMediaFile: (kind: 'audio' | 'srt') => Promise<string | null>;
  getPathForFile: (file: File) => string;
  addAsset: () => Promise<{
    path: string;
    type: 'video' | 'image' | 'audio';
    durationMs: number;
  } | null>;
  scanProjectAssets: (projectDir: string) => Promise<
    { path: string; type: 'video' | 'image' | 'audio' | 'srt'; durationMs: number }[]
  >;
  scanImportDirectory: (dir: string) => Promise<{
    audioFiles: string[];
    srtFiles: string[];
  }>;
  renderVideo: (args: {
    timeline: string;
    outputPath: string;
    exportConfig: ExportConfig;
  }) => Promise<{ outputPath: string }>;
  getAppLogs: () => Promise<AppLogEntry[]>;
  getAppLogFilePath: () => Promise<string>;
  onRenderProgress: (callback: (progress: number) => void) => () => void;
  onMenuAction: (callback: (event: MenuEvent) => void) => () => void;
  onAppLog: (callback: (entry: AppLogEntry) => void) => () => void;
  toggleDevTools: () => Promise<void>;
  showItemInFolder: (filePath: string) => void;
  openExternal: (url: string) => void;
  // Script workbench
  saveScriptFile: (projectDir: string, filename: string, content: string) => Promise<void>;
  loadScriptFile: (projectDir: string, filename: string) => Promise<string | null>;
  saveScriptState: (projectDir: string, state: string) => Promise<void>;
  loadScriptState: (projectDir: string) => Promise<string | null>;
  selectTextFile: () => Promise<{ path: string; content: string } | null>;
  selectHtmlFile: () => Promise<{ path: string; content: string } | null>;
  /** 轻量级抖音链接解析：仅返回标题和视频 ID，不下载视频 */
  resolveDouyinUrl: (url: string) => Promise<{ title: string; videoId: string }>;
  importVideoSource: (request: VideoImportRequest) => Promise<VideoImportProgress>;
  getVideoImportStatus: (importId: string) => Promise<VideoImportProgress | null>;
  startWatching: (dir: string) => Promise<void>;
  stopWatching: () => Promise<void>;
  onFileChanged: (callback: (data: { file: string; content: string }) => void) => () => void;
  onFileTreeChanged: (callback: (data: { type: string; file: string }) => void) => () => void;
  readDirectory: (dir: string) => Promise<FileEntry[]>;
  setMenuContext: (context: MenuContext) => Promise<void>;
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
  }) => Promise<{ audioPath: string; srtPath: string; durationMs: number }>;
  onTTSProgress: (callback: (pct: number) => void) => () => void;
  cancelTTS: (requestId: string) => Promise<void>;
  selectOutputPath: (defaultPath?: string) => Promise<string | null>;
  showEditorContextMenu: () => Promise<void>;
  showWorkbenchTabContextMenu: (request: WorkbenchTabContextMenuRequest) => Promise<void>;
  onWorkbenchTabMenuAction: (callback: (event: WorkbenchTabMenuEvent) => void) => () => void;
  // 最近项目管理
  loadRecentProjects: () => Promise<RecentProjectEntry[]>;
  addRecentProject: (projectDir: string, projectName?: string) => Promise<RecentProjectEntry[]>;
  removeRecentProject: (projectDir: string) => Promise<RecentProjectEntry[]>;
  refreshRecentProjects: () => Promise<RecentProjectEntry[]>;
  exportConfigBackup: () => Promise<
    { canceled: true } | { canceled: false; filePath: string }
  >;
  previewConfigBackup: () => Promise<
    | { canceled: true }
    | {
        canceled: false;
        filePath: string;
        schemaVersion: string;
        exportedAt: string;
        appVersion: string;
        platform: string;
      }
  >;
  importConfigBackup: (args: { filePath: string }) => Promise<{
    appliedFrom: string;
    settingsBackupPath: string;
    agentBackupPath?: string;
  }>;

  // 提示词配置
  listPrompts: (args?: { projectDir?: string }) => Promise<
    Array<{
      kind: PromptKind;
      effectiveScope: PromptScope;
      hasGlobal: boolean;
      hasProject: boolean;
      meta: PromptKindMeta;
    }>
  >;
  listPromptKinds: () => Promise<Array<{ kind: PromptKind; meta: PromptKindMeta }>>;
  readPrompt: (args: {
    kind: PromptKind;
    scope: PromptScope;
    projectDir?: string;
  }) => Promise<{ kind: PromptKind; scope: PromptScope; content: string | null }>;
  readEffectivePrompt: (args: { kind: PromptKind; projectDir?: string }) => Promise<
    EffectivePromptTemplate & { kind: PromptKind }
  >;
  writePrompt: (args: {
    kind: PromptKind;
    scope: 'global' | 'project';
    content: string;
    projectDir?: string;
  }) => Promise<{ kind: PromptKind; scope: 'global' | 'project'; filePath: string }>;
  deletePrompt: (args: {
    kind: PromptKind;
    scope: 'global' | 'project';
    projectDir?: string;
  }) => Promise<{ kind: PromptKind; scope: 'global' | 'project'; removed: boolean }>;
  getDefaultPrompt: (args: { kind: PromptKind }) => Promise<{ kind: PromptKind; content: string }>;
  readPromptBindings(scope: 'project', projectDir: string): Promise<PromptBindingMap>;
  writePromptBindings(scope: 'project', bindings: PromptBindingMap, projectDir: string): Promise<void>;

  // 用户自定义提示词条目（如口播模板）
  listUserPromptCategories: () => Promise<PromptCategoryMeta[]>;
  listUserPrompts: (category: PromptCategory) => Promise<UserPromptEntry[]>;
  readUserPrompt: (category: PromptCategory, id: string) => Promise<UserPromptEntry | null>;
  writeUserPrompt: (input: {
    category: PromptCategory;
    id: string;
    name: string;
    description: string;
    version?: number;
    system: string;
    user: string;
  }) => Promise<UserPromptEntry>;
  deleteUserPrompt: (
    category: PromptCategory,
    id: string,
  ) => Promise<{ removed: boolean; restoredToSeed: boolean }>;
  getUserPromptSeed: (category: PromptCategory, id: string) => Promise<UserPromptSeed | null>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// ─── ScriptHistoryAPI ─────────────────────────────────

export interface ScriptHistoryAPI {
  create(input: {
    projectId: string;
    fileName: string;
    content: string;
    source: string;
    providerId?: string | null;
    providerName?: string | null;
    modelName?: string | null;
  }): Promise<{
    id: number;
    fileName: string;
    source: string;
    providerName: string | null;
    modelName: string | null;
    label: string | null;
    byteSize: number;
    createdAt: string;
  }>;
  list(projectId: string, fileName: string, opts?: {
    sourceFilter?: string[];
    limit?: number;
    offset?: number;
  }): Promise<Array<{
    id: number;
    fileName: string;
    source: string;
    providerName: string | null;
    modelName: string | null;
    label: string | null;
    byteSize: number;
    createdAt: string;
  }>>;
  get(projectId: string, versionId: number): Promise<{
    id: number;
    projectId: string;
    fileName: string;
    content: string;
    source: string;
    providerId: string | null;
    providerName: string | null;
    modelName: string | null;
    label: string | null;
    byteSize: number;
    createdAt: string;
  } | null>;
  rollback(versionId: number, currentContent: string, projectId: string, fileName: string): Promise<{
    rollbackContent: string;
    savedCurrentVersionId: number;
  }>;
  updateLabel(projectId: string, versionId: number, label: string | null): Promise<void>;
  delete(projectId: string, versionId: number): Promise<void>;
}

declare global {
  interface Window {
    scriptHistoryAPI: ScriptHistoryAPI;
  }
}

// 引入 AgentAPI 类型声明
import './agent-api';

export {};
