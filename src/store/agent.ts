import { create } from 'zustand';
import type {
  AcpConfigOption,
  AgentMode,
  AvailableCommand,
  ConnectionStatus,
  PermissionOption,
  PromptInputBlock,
} from '../../electron/acp/types';

// ─── 消息类型 ─────────────────────────────────────────────

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  text: string;
}

export interface ToolCallBlock {
  type: 'tool_call';
  toolCallId: string;
  title: string;
  kind: string;
  status: string;
  rawInput?: string;
  rawOutput?: string;
}

export interface PermissionBlock {
  type: 'permission_request';
  requestId: string;
  toolCall: unknown;
  options: PermissionOption[];
  response?: string;
}

export interface FileChangedBlock {
  type: 'file_changed';
  path: string;
  before: string | null;
  after: string;
}

export interface ErrorBlock {
  type: 'error';
  message: string;
}

export interface TurnCompleteBlock {
  type: 'turn_complete';
  stopReason: string;
}

export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | ToolCallBlock
  | PermissionBlock
  | FileChangedBlock
  | ErrorBlock
  | TurnCompleteBlock;

export type AgentMessage =
  | { role: 'user'; content: string; attachments?: PromptInputBlock[] }
  | { role: 'assistant'; blocks: ContentBlock[] };

// ─── Store ────────────────────────────────────────────────

interface AgentState {
  status: ConnectionStatus;
  sessionId: string | null;
  messages: AgentMessage[];
  modes: AgentMode[];
  currentMode: string;
  configOptions: AcpConfigOption[];
  availableCommands: AvailableCommand[];
  sidebarOpen: boolean;
  contextUsage: { used: number; size: number } | null;
  autoConnectError: string | null;
}

interface AgentActions {
  setStatus: (status: ConnectionStatus) => void;
  setSessionId: (id: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setModes: (modes: AgentMode[]) => void;
  setCurrentMode: (mode: string) => void;
  setConfigOptions: (options: AcpConfigOption[]) => void;
  setAvailableCommands: (commands: AvailableCommand[]) => void;

  setContextUsage: (usage: { used: number; size: number } | null) => void;
  setAutoConnectError: (error: string | null) => void;

  addUserMessage: (content: string, attachments?: PromptInputBlock[]) => void;
  startAssistantMessage: () => void;
  appendTextDelta: (text: string) => void;
  appendThinking: (text: string) => void;
  addToolCall: (tc: Omit<ToolCallBlock, 'type'>) => void;
  updateToolCall: (update: {
    toolCallId: string;
    title?: string;
    status?: string;
    rawInput?: string;
    rawOutput?: string;
    rawOutputAppend?: boolean;
  }) => void;
  addPermissionRequest: (pr: Omit<PermissionBlock, 'type'>) => void;
  resolvePermission: (requestId: string, optionId: string) => void;
  addFileChanged: (fc: { path: string; before: string | null; after: string }) => void;
  addError: (message: string) => void;
  markTurnComplete: (stopReason: string) => void;
  updateConfigValue: (configId: string, value: string) => void;
  clearMessages: () => void;
  reset: () => void;
}

const initialState: AgentState = {
  status: 'disconnected',
  sessionId: null,
  messages: [],
  modes: [],
  currentMode: '',
  configOptions: [],
  availableCommands: [],
  sidebarOpen: false,
  contextUsage: null,
  autoConnectError: null,
};

export const useAgentStore = create<AgentState & AgentActions>((set) => ({
  ...initialState,

  setStatus: (status) => set({ status }),
  setSessionId: (id) => set({ sessionId: id }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setModes: (modes) => set({ modes }),
  setCurrentMode: (mode) => set({ currentMode: mode }),
  setConfigOptions: (options) => set({ configOptions: options }),
  setAvailableCommands: (commands) => set({ availableCommands: commands }),
  setContextUsage: (usage) => set({ contextUsage: usage }),
  setAutoConnectError: (error) => set({ autoConnectError: error }),

  addUserMessage: (content, attachments) => {
    set((s) => ({
      messages: [...s.messages, { role: 'user', content, ...(attachments?.length ? { attachments } : {}) }],
    }));
  },

  startAssistantMessage: () => {
    set((s) => ({ messages: [...s.messages, { role: 'assistant', blocks: [] }] }));
  },

  appendTextDelta: (text) => {
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (!last || last.role !== 'assistant') return s;

      const blocks = [...last.blocks];
      const lastBlock = blocks[blocks.length - 1];

      if (lastBlock?.type === 'text') {
        blocks[blocks.length - 1] = { ...lastBlock, text: lastBlock.text + text };
      } else {
        blocks.push({ type: 'text', text });
      }

      messages[messages.length - 1] = { role: 'assistant', blocks };
      return { messages };
    });
  },

  appendThinking: (text) => {
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (!last || last.role !== 'assistant') return s;

      const blocks = [...last.blocks];
      const lastBlock = blocks[blocks.length - 1];

      if (lastBlock?.type === 'thinking') {
        blocks[blocks.length - 1] = { ...lastBlock, text: lastBlock.text + text };
      } else {
        blocks.push({ type: 'thinking', text });
      }

      messages[messages.length - 1] = { role: 'assistant', blocks };
      return { messages };
    });
  },

  addToolCall: (tc) => {
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (!last || last.role !== 'assistant') return s;

      const blocks = [...last.blocks, { type: 'tool_call' as const, ...tc }];
      messages[messages.length - 1] = { role: 'assistant', blocks };
      return { messages };
    });
  },

  updateToolCall: (update) => {
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (!last || last.role !== 'assistant') return s;

      const blocks = last.blocks.map((b) => {
        if (b.type !== 'tool_call' || b.toolCallId !== update.toolCallId) return b;
        const updated = { ...b };
        if (update.title !== undefined) updated.title = update.title;
        if (update.status !== undefined) updated.status = update.status;
        if (update.rawInput !== undefined) updated.rawInput = update.rawInput;
        if (update.rawOutput !== undefined) {
          if (update.rawOutputAppend) {
            updated.rawOutput = (updated.rawOutput || '') + update.rawOutput;
          } else {
            updated.rawOutput = update.rawOutput;
          }
        }
        return updated;
      });

      messages[messages.length - 1] = { role: 'assistant', blocks };
      return { messages };
    });
  },

  addPermissionRequest: (pr) => {
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (!last || last.role !== 'assistant') return s;

      const blocks = [...last.blocks, { type: 'permission_request' as const, ...pr }];
      messages[messages.length - 1] = { role: 'assistant', blocks };
      return { messages };
    });
  },

  resolvePermission: (requestId, optionId) => {
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (!last || last.role !== 'assistant') return s;

      const blocks = last.blocks.map((b) => {
        if (b.type !== 'permission_request' || b.requestId !== requestId) return b;
        return { ...b, response: optionId };
      });

      messages[messages.length - 1] = { role: 'assistant', blocks };
      return { messages };
    });
  },

  addFileChanged: (fc) => {
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (!last || last.role !== 'assistant') return s;

      const blocks = [...last.blocks, { type: 'file_changed' as const, ...fc }];
      messages[messages.length - 1] = { role: 'assistant', blocks };
      return { messages };
    });
  },

  addError: (message) => {
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (last?.role === 'assistant') {
        const blocks = [...last.blocks, { type: 'error' as const, message }];
        messages[messages.length - 1] = { role: 'assistant', blocks };
      } else {
        messages.push({ role: 'assistant', blocks: [{ type: 'error', message }] });
      }
      return { messages };
    });
  },

  markTurnComplete: (stopReason) => {
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (!last || last.role !== 'assistant') return s;

      const blocks = [...last.blocks, { type: 'turn_complete' as const, stopReason }];
      messages[messages.length - 1] = { role: 'assistant', blocks };
      return { messages };
    });
  },

  updateConfigValue: (configId, value) => {
    set((s) => ({
      configOptions: s.configOptions.map((opt) =>
        opt.id === configId ? { ...opt, currentValue: value } : opt,
      ),
    }));
  },

  clearMessages: () => set({ messages: [] }),
  reset: () => set(initialState),
}));
