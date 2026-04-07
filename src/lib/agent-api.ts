import type {
  AgentConfigData,
  AgentMode,
  ConnectionStatus,
  PermissionOption,
  PermissionPolicy,
  PreflightCheck,
  PromptInputBlock,
} from '../../electron/acp/types';

// ─── 前端使用的消息类型 ────────────────────────────────────

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | {
      type: 'tool_call';
      toolCallId: string;
      title: string;
      kind: string;
      status: string;
      rawInput?: string;
      rawOutput?: string;
    }
  | {
      type: 'tool_call_update';
      toolCallId: string;
      title?: string;
      status?: string;
      rawInput?: string;
      rawOutput?: string;
      rawOutputAppend?: boolean;
    }
  | {
      type: 'turn_complete';
      stopReason: string;
    }
  | {
      type: 'permission_request';
      requestId: string;
      toolCall: unknown;
      options: PermissionOption[];
    }
  | {
      type: 'file_changed';
      path: string;
      before: string | null;
      after: string;
    }
  | {
      type: 'error';
      message: string;
    };

export interface AgentCapabilities {
  modes: AgentMode[];
  configOptions: ConfigOption[];
  forkSupported: boolean;
}

// ─── AgentAPI 接口（window.agentAPI）────────────────────────

export interface AgentAPI {
  // 连接管理
  connect(projectDir: string): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<string>;

  // 对话
  sendPrompt(contents: PromptInputBlock[]): Promise<void>;
  cancelTurn(): Promise<void>;

  // 模式与配置
  setMode(modeId: string): Promise<void>;
  setConfigOption(configId: string, valueId: string): Promise<void>;

  // 权限
  respondPermission(requestId: string, optionId: string): Promise<void>;

  // 设置
  getConfig(): Promise<AgentConfigData>;
  saveConfig(data: AgentConfigData): Promise<void>;
  getApiKey(agentId: string): Promise<string>;
  setApiKey(agentId: string, key: string): Promise<void>;
  getPermissionPolicy(): Promise<PermissionPolicy>;
  setPermissionPolicy(policy: PermissionPolicy): Promise<void>;

  // 预检与安装
  runPreflight(): Promise<PreflightCheck[]>;
  installAgent(version: string): Promise<void>;
  uninstallAgent(): Promise<void>;
  getLatestVersion(): Promise<string | null>;

  // 事件监听（Main → Renderer）
  onStatusChanged(callback: (status: ConnectionStatus) => void): () => void;
  onEvent(callback: (block: ContentBlock) => void): () => void;
  onCapabilities(callback: (caps: AgentCapabilities) => void): () => void;
}

declare global {
  interface Window {
    agentAPI: AgentAPI;
  }
}
