import type { ExportConfig } from './export-settings';
import type { AppLogEntry } from './app-log';
import type { SrtEntry } from '../types';
import type { AICard, AISettings, CoverCandidate } from '../types/ai';
import type { ImportKind } from './import-files';

export type AppPage = 'welcome' | 'setup' | 'editor' | 'script-workbench' | 'settings';

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

export interface ElectronAPI {
  parseSrtFile: (filePath: string) => Promise<{ entries: SrtEntry[]; durationMs: number }>;
  analyzeSrt: (args: {
    entries?: SrtEntry[];
    srtContent?: string;
    settings: AISettings;
    globalPrompt?: string;
  }) => Promise<unknown>;
  regenerateAICard: (args: {
    entries: SrtEntry[];
    card: AICard;
    settings: AISettings;
    globalPrompt?: string;
    cardPrompt?: string;
  }) => Promise<AICard>;
  regenerateCoverPrompt: (args: {
    entries: SrtEntry[];
    settings: AISettings;
    globalPrompt?: string;
    currentPrompt?: string;
  }) => Promise<string[]>;
  generateCoverImages: (args: {
    prompts: string[];
    settings: AISettings;
    projectDir: string;
  }) => Promise<CoverCandidate[]>;
  saveTimeline: (projectDir: string, data: string) => Promise<string>;
  loadTimeline: (projectDir: string) => Promise<string | null>;
  saveAIAnalysis: (projectDir: string, data: string) => Promise<string>;
  loadAIAnalysis: (projectDir: string) => Promise<string | null>;
  getProjectMetadata: (projectDir: string) => Promise<ProjectMetadata>;
  selectProjectDirectory: () => Promise<string | null>;
  selectSetupFile: (kind: ImportKind) => Promise<string | null>;
  selectMediaFile: (kind: 'audio' | 'srt') => Promise<string | null>;
  getPathForFile: (file: File) => string;
  addAsset: () => Promise<{
    path: string;
    type: 'video' | 'image';
    durationMs: number;
  } | null>;
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
  // Script workbench
  saveScriptFile: (projectDir: string, filename: string, content: string) => Promise<void>;
  loadScriptFile: (projectDir: string, filename: string) => Promise<string | null>;
  saveScriptState: (projectDir: string, state: string) => Promise<void>;
  loadScriptState: (projectDir: string) => Promise<string | null>;
  selectTextFile: () => Promise<{ path: string; content: string } | null>;
  setMenuContext: (context: MenuContext) => Promise<void>;

  selectOutputPath: () => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// 引入 AgentAPI 类型声明
import './agent-api';

export {};
