import { describe, expect, it, beforeEach, vi } from 'vitest';

const mockAgentAPI = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  sendPrompt: vi.fn(),
  cancelTurn: vi.fn(),
  setMode: vi.fn(),
  respondPermission: vi.fn(),
  onStatusChanged: vi.fn(() => vi.fn()),
  onEvent: vi.fn(() => vi.fn()),
  onCapabilities: vi.fn(() => vi.fn()),
};

vi.stubGlobal('window', { agentAPI: mockAgentAPI });

describe('useAgentStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initial state is disconnected with empty messages', async () => {
    const { useAgentStore } = await import('../src/store/agent');
    const state = useAgentStore.getState();
    expect(state.status).toBe('disconnected');
    expect(state.messages).toEqual([]);
    expect(state.sessionId).toBeNull();
  });

  it('appendTextDelta appends to last assistant text block', async () => {
    const { useAgentStore } = await import('../src/store/agent');
    const store = useAgentStore.getState();

    store.startAssistantMessage();
    store.appendTextDelta('Hello ');
    store.appendTextDelta('world');

    const state = useAgentStore.getState();
    const lastMsg = state.messages[state.messages.length - 1];
    expect(lastMsg.role).toBe('assistant');
    if (lastMsg.role === 'assistant') {
      expect(lastMsg.blocks[0]).toEqual({ type: 'text', text: 'Hello world' });
    }
  });

  it('addToolCall adds a tool_call block', async () => {
    const { useAgentStore } = await import('../src/store/agent');
    const store = useAgentStore.getState();

    store.startAssistantMessage();
    store.addToolCall({
      toolCallId: 'tc1',
      title: 'read_text_file',
      kind: 'file',
      status: 'running',
    });

    const state = useAgentStore.getState();
    const lastMsg = state.messages[state.messages.length - 1];
    if (lastMsg.role === 'assistant') {
      const tc = lastMsg.blocks.find((b) => b.type === 'tool_call');
      expect(tc).toBeDefined();
    }
  });

  it('addUserMessage adds user message', async () => {
    const { useAgentStore } = await import('../src/store/agent');
    useAgentStore.getState().addUserMessage('hi');
    const state = useAgentStore.getState();
    expect(state.messages[state.messages.length - 1]).toEqual({
      role: 'user',
      content: 'hi',
    });
  });
});
