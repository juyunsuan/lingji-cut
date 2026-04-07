// ─── JSON-RPC 2.0 基础 ───────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

// ─── ACP 协议消息 ────────────────────────────────────────────

// Client → Agent

export interface InitializeParams {
  protocolVersion: number;
  clientCapabilities: {
    terminal: boolean;
    fs: {
      readTextFile: boolean;
      writeTextFile: boolean;
    };
  };
}

export interface InitializeResult {
  protocolVersion: number;
  agentCapabilities?: {
    promptCapabilities?: {
      image?: boolean;
      embeddedContext?: boolean;
    };
    loadSession?: boolean;
    sessionCapabilities?: {
      fork?: Record<string, unknown>;
      list?: Record<string, unknown>;
      resume?: Record<string, unknown>;
      close?: Record<string, unknown>;
    };
  };
  agentInfo?: {
    name?: string;
    title?: string;
    version?: string;
  };
  // 兼容旧字段
  serverCapabilities?: {
    prompting?: {
      modes?: AgentMode[];
      configOptions?: ConfigOption[];
    };
    fork?: boolean;
  };
}

export interface AgentMode {
  modeId: string;
  name: string;
  description?: string;
}

export interface ConfigOption {
  configId: string;
  name: string;
  description?: string;
  values: ConfigOptionValue[];
}

export interface ConfigOptionValue {
  valueId: string;
  name: string;
}

export interface NewSessionParams {
  cwd: string;
}

export interface NewSessionResult {
  sessionId: string;
  models?: {
    availableModels: { modelId: string; name: string; description?: string }[];
    currentModelId: string;
  };
  modes?: {
    currentModeId: string;
    availableModes: { id: string; name: string; description?: string; decription?: string }[];
  };
  configOptions?: ConfigOption[];
}

export interface LoadSessionParams {
  sessionId: string;
  cwd: string;
  mcpServers?: unknown[];
}

export interface PromptParams {
  sessionId: string;
  prompt: PromptInputBlock[];
}

export interface SetSessionModeParams {
  sessionId: string;
  modeId: string;
}

export interface SetSessionConfigOptionParams {
  sessionId: string;
  configId: string;
  valueId: string;
}

// Agent → Client (请求)

export interface RequestPermissionParams {
  toolCall: unknown;
  options: PermissionOption[];
}

export interface PermissionOption {
  optionId: string;
  name: string;
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
}

export interface ReadTextFileParams {
  path: string;
}

export interface WriteTextFileParams {
  path: string;
  content: string;
}

export interface CreateTerminalParams {
  cwd?: string;
}

export interface TerminalExecuteParams {
  terminalId: string;
  command: string;
}

export interface KillTerminalParams {
  terminalId: string;
}

// ─── 流式事件（Agent → Client 通知）──────────────────────────

export type AcpEvent =
  | ContentDeltaEvent
  | ThinkingEvent
  | ToolCallEvent
  | ToolCallUpdateEvent
  | TurnCompleteEvent
  | PermissionRequestEvent
  | UsageEvent;

export interface ContentDeltaEvent {
  type: 'content_delta';
  text: string;
}

export interface ThinkingEvent {
  type: 'thinking';
  text: string;
}

export interface ToolCallEvent {
  type: 'tool_call';
  toolCallId: string;
  title: string;
  kind: string;
  status: string;
  content?: string;
  rawInput?: string;
  rawOutput?: string;
}

export interface ToolCallUpdateEvent {
  type: 'tool_call_update';
  toolCallId: string;
  title?: string;
  status?: string;
  content?: string;
  rawInput?: string;
  rawOutput?: string;
  rawOutputAppend?: boolean;
}

export interface TurnCompleteEvent {
  type: 'turn_complete';
  sessionId: string;
  stopReason: string;
  agentType: string;
  usage?: { used: number; size: number };
}

export interface UsageEvent {
  type: 'usage';
  used: number;
  size: number;
}

export interface PermissionRequestEvent {
  type: 'permission_request';
  requestId: string;
  toolCall: unknown;
  options: PermissionOption[];
}

// ─── Prompt 输入 ─────────────────────────────────────────────

export type PromptInputBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string; uri?: string }
  | { type: 'resource'; uri: string; mimeType?: string; text?: string; blob?: string };

// ─── 连接状态 ────────────────────────────────────────────────

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'prompting' | 'error';

// ─── 斜杠命令 ──────────────────────────────────────────────

export interface AvailableCommand {
  name: string;
  description: string;
  input?: { hint?: string } | null;
}

// ─── ACP 配置选项（session/new 实际返回格式）────────────────

export interface AcpConfigOption {
  id: string;
  name: string;
  description?: string;
  category?: string;
  type: 'select';
  currentValue: string;
  options: AcpConfigOptionValue[];
}

export interface AcpConfigOptionValue {
  value: string;
  name: string;
  description?: string;
}

// ─── 配置 ────────────────────────────────────────────────────

export type PermissionPolicy = 'auto_approve' | 'tiered' | 'always_ask';
export type AuthMode = 'subscription' | 'custom_api';

export interface AgentConfigData {
  agents: Record<string, AgentEntry>;
  permissionPolicy: PermissionPolicy;
}

export interface AgentEntry {
  enabled: boolean;
  authMode: AuthMode;
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  envText: string;
  configJson: string;
  version: string;
  sortOrder: number;
}

// ─── 预检 ────────────────────────────────────────────────────

export type PreflightStatus = 'pass' | 'fail' | 'warn' | 'checking';
export type PreflightFixAction = 'install' | 'upgrade' | 'uninstall' | 'clear_cache';

export interface PreflightCheck {
  label: string;
  status: PreflightStatus;
  message: string;
  fixAction?: PreflightFixAction;
}

// ─── 工具函数 ────────────────────────────────────────────────

export function isJsonRpcResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return 'id' in msg && ('result' in msg || 'error' in msg) && !('method' in msg);
}

export function isJsonRpcRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return 'id' in msg && 'method' in msg && !('result' in msg) && !('error' in msg);
}

export function isJsonRpcNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
  return 'method' in msg && !('id' in msg);
}
