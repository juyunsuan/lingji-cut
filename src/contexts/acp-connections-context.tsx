import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ConnectionStatus, PromptInputBlock } from '../../electron/acp/types';
import { appendConversationTurn, updateConversation } from '../lib/conversation-api';
import type {
  ConversationBlock,
  ConversationConnectionState,
  LiveContentBlock,
  LiveToolCallInfo,
  PendingPermission,
} from '../types/conversation';
import { useConversationWorkspace } from './conversation-workspace-context';
import { useAgentStore } from '../store/agent';

type ConnectionsMap = Record<number, ConversationConnectionState>;

const DEFAULT_AGENT_TYPE = 'claude';

function createEmptyConnectionState(conversationId: number, agentType = DEFAULT_AGENT_TYPE): ConversationConnectionState {
  return {
    conversationId,
    agentType,
    status: 'disconnected',
    sessionId: null,
    liveMessage: null,
    pendingPermission: null,
    usage: null,
    availableCommands: null,
    configOptions: null,
    availableModes: null,
    currentModeId: null,
    models: null,
    error: null,
  };
}

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function nextLiveMessageBlock(state: ConversationConnectionState, block: LiveContentBlock): ConversationConnectionState {
  const existing = state.liveMessage;
  if (!existing) {
    return {
      ...state,
      liveMessage: {
        id: `${state.conversationId}-${Date.now()}`,
        role: 'assistant',
        content: [block],
        startedAt: Date.now(),
      },
    };
  }

  const lastBlock = existing.content[existing.content.length - 1];
  if (lastBlock?.type === 'text' && block.type === 'text') {
    return {
      ...state,
      liveMessage: {
        ...existing,
        content: [
          ...existing.content.slice(0, -1),
          {
            type: 'text',
            text: lastBlock.text + block.text,
          },
        ],
      },
    };
  }
  if (lastBlock?.type === 'thinking' && block.type === 'thinking') {
    return {
      ...state,
      liveMessage: {
        ...existing,
        content: [
          ...existing.content.slice(0, -1),
          {
            type: 'thinking',
            text: lastBlock.text + block.text,
          },
        ],
      },
    };
  }
  return {
    ...state,
    liveMessage: {
      ...existing,
      content: [...existing.content, block],
    },
  };
}

function updateLiveToolCall(
  state: ConversationConnectionState,
  info: Partial<LiveToolCallInfo> & { toolCallId: string; rawOutputAppend?: boolean },
): ConversationConnectionState {
  const existing = state.liveMessage;
  if (!existing) {
    return state;
  }

  return {
    ...state,
    liveMessage: {
      ...existing,
      content: existing.content.map((block) => {
        if (block.type !== 'tool_call' || block.info.toolCallId !== info.toolCallId) {
          return block;
        }
        return {
          type: 'tool_call',
          info: {
            ...block.info,
            ...info,
            rawOutput:
              info.rawOutputAppend && typeof info.rawOutput === 'string'
                ? `${block.info.rawOutput ?? ''}${info.rawOutput}`
                : info.rawOutput ?? block.info.rawOutput,
          },
        };
      }),
    },
  };
}

function toConversationBlocks(contents: PromptInputBlock[]): ConversationBlock[] {
  return contents.map((block) => {
    if (block.type === 'text') {
      return { type: 'text', text: block.text };
    }
    if (block.type === 'resource') {
      return {
        type: 'text',
        text: block.text?.trim() || `[resource] ${block.uri}`,
      };
    }
    return {
      type: 'text',
      text: block.uri ? `[image] ${block.uri}` : `[image] ${block.mimeType}`,
    };
  });
}

function toPersistedBlocks(message: ConversationConnectionState['liveMessage']): ConversationBlock[] {
  if (!message) {
    return [];
  }

  return message.content.map((block) => {
    if (block.type === 'tool_call') {
      return {
        type: 'tool_call',
        toolCallId: block.info.toolCallId,
        title: block.info.title,
        kind: block.info.kind,
        status: block.info.status,
        rawInput: block.info.rawInput,
        rawOutput: block.info.rawOutput,
      };
    }
    if (block.type === 'thinking') {
      return {
        type: 'thinking',
        text: block.text,
      };
    }
    if (block.type === 'error') {
      return {
        type: 'error',
        message: block.message,
      };
    }
    if (block.type === 'file_changed') {
      return {
        type: 'file_changed',
        path: block.path,
        before: block.before,
        after: block.after,
      };
    }
    return {
      type: 'text',
      text: block.text,
    };
  });
}

function isMissingConversationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /Conversation \d+ not found/.test(error.message);
}

export interface ConnectionCommandInput {
  conversationId: number;
  projectDir: string;
  sessionId?: string | null;
  agentType?: string;
}

export interface AcpConnectionsContextValue {
  activeConversationId: number | null;
  connections: ConnectionsMap;
  setActiveConversationId: (conversationId: number | null) => void;
  getConnection: (conversationId: number) => ConversationConnectionState;
  connect: (input: ConnectionCommandInput) => Promise<void>;
  disconnect: (conversationId: number) => Promise<void>;
  sendPrompt: (conversationId: number, contents: PromptInputBlock[]) => Promise<void>;
  cancelTurn: (conversationId: number) => Promise<void>;
  setMode: (conversationId: number, modeId: string) => Promise<void>;
  setConfigOption: (conversationId: number, configId: string, valueId: string) => Promise<void>;
  respondPermission: (conversationId: number, requestId: string, optionId: string) => Promise<void>;
}

const AcpConnectionsContext = createContext<AcpConnectionsContextValue | null>(null);

interface AcpConnectionsProviderProps {
  children: ReactNode;
}

export function AcpConnectionsProvider({ children }: AcpConnectionsProviderProps) {
  const workspace = useConversationWorkspace();
  const [connections, setConnections] = useState<ConnectionsMap>({});
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const connectionsRef = useRef<ConnectionsMap>({});
  const workspaceRef = useRef(workspace);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  function updateConversationState(
    conversationId: number,
    updater: (current: ConversationConnectionState) => ConversationConnectionState,
  ) {
    setConnections((prev) => {
      const current = prev[conversationId] ?? createEmptyConnectionState(conversationId);
      const next = {
        ...prev,
        [conversationId]: updater(current),
      };
      connectionsRef.current = next;
      return next;
    });
  }

  function getConnection(conversationId: number): ConversationConnectionState {
    return connections[conversationId] ?? createEmptyConnectionState(conversationId);
  }

  async function persistConversationSummary(
    conversationId: number,
    patch: { title?: string; externalId?: string | null; sessionStatsJson?: string | null; messageCount?: number },
  ) {
    const projectId = workspaceRef.current.projectId;
    if (!projectId) return;
    try {
      const updated = await updateConversation(conversationId, patch, projectId);
      workspaceRef.current.applyConversationSummary(updated);
    } catch (error) {
      if (!isMissingConversationError(error)) {
        throw error;
      }
    }
  }

  async function persistConversationTurn(
    conversationId: number,
    input: { role: 'user' | 'assistant'; blocks: ConversationBlock[]; sessionStatsJson?: string | null },
  ) {
    const projectId = workspaceRef.current.projectId;
    if (!projectId || input.blocks.length === 0) return;
    try {
      const result = await appendConversationTurn(conversationId, input, projectId);
      workspaceRef.current.appendPersistedTurn(result.conversation, result.turn);
    } catch (error) {
      if (!isMissingConversationError(error)) {
        throw error;
      }
    }
  }

  function applyRuntimeEvent(conversationId: number, rawEvent: unknown) {
    const payload = rawEvent as Record<string, unknown>;
    const type = String(payload.type ?? '');
    if (type === 'session_started') {
      const sessionId = String(payload.sessionId ?? '');
      if (sessionId) {
        void persistConversationSummary(conversationId, { externalId: sessionId });
      }
    }
    if (type === 'turn_complete') {
      const current = connectionsRef.current[conversationId] ?? createEmptyConnectionState(conversationId);
      const blocks = toPersistedBlocks(current.liveMessage);
      const stopReason = String(payload.stopReason ?? 'end_turn');
      const usage =
        payload.usage && typeof payload.usage === 'object'
          ? JSON.stringify(payload.usage)
          : undefined;
      void persistConversationTurn(conversationId, {
        role: 'assistant',
        blocks: [...blocks, { type: 'turn_complete', stopReason }],
        sessionStatsJson: usage,
      });
    }

    updateConversationState(conversationId, (current) => {
      switch (type) {
        case 'session_started':
          return {
            ...current,
            sessionId: String(payload.sessionId ?? ''),
            status: 'connected',
          };
        case 'content_delta':
        case 'text':
          return nextLiveMessageBlock(current, { type: 'text', text: String(payload.text ?? '') });
        case 'thinking':
          return nextLiveMessageBlock(current, { type: 'thinking', text: String(payload.text ?? '') });
        case 'tool_call': {
          const info: LiveToolCallInfo = {
            toolCallId: String(payload.toolCallId ?? ''),
            title: String(payload.title ?? ''),
            kind: String(payload.kind ?? ''),
            status: String(payload.status ?? ''),
            rawInput: typeof payload.rawInput === 'string' ? payload.rawInput : undefined,
            rawOutput: typeof payload.rawOutput === 'string' ? payload.rawOutput : undefined,
          };
          return nextLiveMessageBlock(current, { type: 'tool_call', info });
        }
        case 'tool_call_update':
          return updateLiveToolCall(current, {
            toolCallId: String(payload.toolCallId ?? ''),
            title: typeof payload.title === 'string' ? payload.title : undefined,
            status: typeof payload.status === 'string' ? payload.status : undefined,
            rawInput: typeof payload.rawInput === 'string' ? payload.rawInput : undefined,
            rawOutput: typeof payload.rawOutput === 'string' ? payload.rawOutput : undefined,
            rawOutputAppend: Boolean(payload.rawOutputAppend),
          });
        case 'permission_request': {
          const pendingPermission: PendingPermission = {
            requestId: String(payload.requestId ?? ''),
            toolCall: payload.toolCall,
            options: (payload.options as PendingPermission['options']) ?? [],
          };
          return {
            ...current,
            pendingPermission,
          };
        }
        case 'mode_update':
          return {
            ...current,
            currentModeId:
              typeof payload.currentModeId === 'string' ? payload.currentModeId : current.currentModeId,
          };
        case 'available_commands':
          return {
            ...current,
            availableCommands: (payload.commands as ConversationConnectionState['availableCommands']) ?? [],
          };
        case 'config_update':
          return {
            ...current,
            configOptions: (payload.configOptions as ConversationConnectionState['configOptions']) ?? [],
          };
        case 'usage':
          return {
            ...current,
            usage: {
              used: Number(payload.used ?? 0),
              size: Number(payload.size ?? 0),
            },
          };
        case 'file_changed':
          return nextLiveMessageBlock(current, {
            type: 'file_changed',
            path: String(payload.path ?? ''),
            before: payload.before == null ? null : String(payload.before),
            after: String(payload.after ?? ''),
          });
        case 'turn_complete':
          return {
            ...current,
            liveMessage: null,
            pendingPermission: null,
          };
        case 'error':
          return nextLiveMessageBlock(
            {
              ...current,
              status: 'error',
              error: String(payload.message ?? 'Unknown ACP error'),
            },
            {
              type: 'error',
              message: String(payload.message ?? 'Unknown ACP error'),
            },
          );
        default:
          return current;
      }
    });
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !window.agentAPI) return;

    const unsubStatus = window.agentAPI.onRuntimeStatusChanged(({ conversationId, status }) => {
      updateConversationState(conversationId, (current) => ({
        ...current,
        status: status as ConnectionStatus,
        sessionId: status === 'disconnected' ? null : current.sessionId,
      }));
    });

    const unsubEvent = window.agentAPI.onRuntimeEvent(({ conversationId, event }) => {
      applyRuntimeEvent(conversationId, event);
    });

    const unsubCaps = window.agentAPI.onRuntimeCapabilities(({ conversationId, capabilities }) => {
      const payload = capabilities as Record<string, unknown>;
      updateConversationState(conversationId, (current) => ({
        ...current,
        currentModeId:
          typeof payload.currentModeId === 'string' ? payload.currentModeId : current.currentModeId,
        configOptions:
          (payload.configOptions as ConversationConnectionState['configOptions']) ?? current.configOptions,
        availableModes:
          (payload.modes as ConversationConnectionState['availableModes']) ?? current.availableModes,
        models:
          (payload.models as ConversationConnectionState['models']) ?? current.models,
      }));
    });

    return () => {
      unsubStatus();
      unsubEvent();
      unsubCaps();
    };
  }, []);

  // ─── 将当前 active 会话的连接状态镜像到全局 useAgentStore ─────────
  // 背景：AppStatusBar / Toolbar 等旧组件仍从 useAgentStore 读取 status / contextUsage，
  // 但 ACP 已迁移到 per-conversation 的 connections map；如果不桥接，右下角会永远显示
  // "未连接"。这里在 provider 作用域内维护一条单向同步。
  useEffect(() => {
    const store = useAgentStore.getState();
    const conn = activeConversationId != null ? connections[activeConversationId] : null;
    if (!conn) {
      store.setStatus('disconnected');
      store.setContextUsage(null);
      store.setAutoConnectError(null);
      return;
    }
    store.setStatus(conn.status);
    store.setContextUsage(conn.usage ?? null);
    store.setAutoConnectError(conn.error ?? null);
  }, [activeConversationId, connections]);

  // Provider 卸载（关闭 Agent 侧边栏）时，复位全局 store，避免残留上一次的状态。
  useEffect(() => {
    return () => {
      const store = useAgentStore.getState();
      store.setStatus('disconnected');
      store.setContextUsage(null);
      store.setAutoConnectError(null);
    };
  }, []);

  async function connect(input: ConnectionCommandInput): Promise<void> {
    if (!window.agentAPI) return;
    updateConversationState(input.conversationId, (current) => ({
      ...current,
      agentType: input.agentType ?? current.agentType,
      status: 'connecting',
      error: null,
    }));
    setActiveConversationId(input.conversationId);
    try {
      await window.agentAPI.connectRuntime({
        conversationId: input.conversationId,
        projectDir: input.projectDir,
        sessionId: input.sessionId ?? null,
        agentType: input.agentType,
      });
      updateConversationState(input.conversationId, (current) => ({
        ...current,
        status: 'connected',
      }));
    } catch (error) {
      updateConversationState(input.conversationId, (current) => ({
        ...current,
        status: 'error',
        error: toMessage(error),
      }));
      throw error;
    }
  }

  async function disconnect(conversationId: number): Promise<void> {
    if (!window.agentAPI) return;
    await window.agentAPI.disconnectRuntime(conversationId);
    updateConversationState(conversationId, (current) => ({
      ...current,
      status: 'disconnected',
      sessionId: null,
      liveMessage: null,
      pendingPermission: null,
    }));
  }

  async function sendPrompt(conversationId: number, contents: PromptInputBlock[]): Promise<void> {
    if (!window.agentAPI) return;
    setActiveConversationId(conversationId);
    updateConversationState(conversationId, (current) => ({
      ...current,
      status: 'prompting',
      error: null,
    }));

    // 首条消息自动命名：提取文本内容作为会话标题（截取前 80 字符）
    const conv = workspaceRef.current.conversations.find((c) => c.id === conversationId);
    if (conv && conv.messageCount === 0) {
      const text = contents
        .filter((b): b is PromptInputBlock & { type: 'text' } => b.type === 'text')
        .map((b) => b.text)
        .join(' ')
        .trim();
      if (text) {
        const title = text.length > 80 ? `${text.slice(0, 80)}…` : text;
        void persistConversationSummary(conversationId, { title });
      }
    }

    await persistConversationTurn(conversationId, {
      role: 'user',
      blocks: toConversationBlocks(contents),
    });
    await window.agentAPI.sendPromptToConversation(conversationId, contents);
  }

  async function cancelTurn(conversationId: number): Promise<void> {
    if (!window.agentAPI) return;
    setActiveConversationId(conversationId);
    await window.agentAPI.cancelConversationTurn(conversationId);
    updateConversationState(conversationId, (current) => ({
      ...current,
      status: 'connected',
    }));
  }

  async function setMode(conversationId: number, modeId: string): Promise<void> {
    if (!window.agentAPI) return;
    setActiveConversationId(conversationId);
    await window.agentAPI.setConversationMode(conversationId, modeId);
    updateConversationState(conversationId, (current) => ({
      ...current,
      currentModeId: modeId,
    }));
  }

  async function setConfigOption(
    conversationId: number,
    configId: string,
    valueId: string,
  ): Promise<void> {
    if (!window.agentAPI) return;
    setActiveConversationId(conversationId);
    await window.agentAPI.setConversationConfigOption(conversationId, configId, valueId);
  }

  async function respondPermission(
    conversationId: number,
    requestId: string,
    optionId: string,
  ): Promise<void> {
    if (!window.agentAPI) return;
    setActiveConversationId(conversationId);
    await window.agentAPI.respondConversationPermission(conversationId, requestId, optionId);
    updateConversationState(conversationId, (current) => ({
      ...current,
      pendingPermission: null,
    }));
  }

  const value: AcpConnectionsContextValue = {
    activeConversationId,
    connections,
    setActiveConversationId,
    getConnection,
    connect,
    disconnect,
    sendPrompt,
    cancelTurn,
    setMode,
    setConfigOption,
    respondPermission,
  };

  return <AcpConnectionsContext.Provider value={value}>{children}</AcpConnectionsContext.Provider>;
}

export function useAcpConnections(): AcpConnectionsContextValue {
  const context = useContext(AcpConnectionsContext);
  if (!context) {
    throw new Error('useAcpConnections must be used within AcpConnectionsProvider');
  }
  return context;
}
