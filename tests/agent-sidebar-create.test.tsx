// @vitest-environment jsdom
//
// AgentSidebar（SidebarWorkspaceShell）新建会话显式选 agent 的测试：
// - 工具栏渲染 AgentPicker（三家）。
// - 选 codex 后新建会话 → createConversation 入参 agentType 为 'codex'。
// - 默认值来自 getPreferredAgentType（mock 返回 'claude'）。
//
// 为避免挂载完整的 workspace / runtime provider 栈（重且在 jsdom 下易内存膨胀），
// 这里 mock useConversationList、useAcpConnections 以及子面板组件，只保留真实的
// ConversationToolbar + AgentPicker 交互链路。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const createConversation = vi.fn(async (input: { agentType: string }) => ({
  id: 201,
  agentType: input.agentType,
}));

// 子面板替换为占位，避免依赖 workspace/runtime context。
vi.mock('../src/components/agent/SessionListPane', () => ({
  SessionListPane: () => null,
}));
vi.mock('../src/components/agent/ChatPane', () => ({
  ChatPane: () => null,
}));

// useConversationList → 暴露被断言的 createConversation。
vi.mock('../src/hooks/use-conversation-list', () => ({
  useConversationList: () => ({
    loading: false,
    activeConversationId: null,
    refresh: vi.fn(),
    createConversation,
    deleteConversation: vi.fn(),
    setActiveConversation: vi.fn(async () => undefined),
  }),
}));

// AcpConnections → 仅 disconnect 被用到。
vi.mock('../src/contexts/acp-connections-context', () => ({
  useAcpConnections: () => ({ disconnect: vi.fn(async () => undefined) }),
}));

const getConfig = vi.fn();
const runPreflight = vi.fn();

beforeEach(() => {
  createConversation.mockClear();
  getConfig.mockReset();
  runPreflight.mockReset();
  // getPreferredAgentType → resolvePreferredAgentType：全局激活 agent 为 claude。
  getConfig.mockResolvedValue({
    activeAgentId: 'claude',
    agents: { claude: { enabled: true, sortOrder: 0 } },
  });
  runPreflight.mockResolvedValue([{ label: 'CLI', status: 'pass', message: 'ok' }]);
  (window as unknown as { agentAPI: unknown }).agentAPI = { getConfig, runPreflight };
});

afterEach(() => {
  delete (window as unknown as { agentAPI?: unknown }).agentAPI;
});

async function mount() {
  // 动态 import，确保 mock 已注册。
  const { SidebarWorkspaceShell } = await import('../src/components/agent/AgentSidebar');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<SidebarWorkspaceShell projectDir="project-a" />);
  });
  // flush preflight / preferred-agent microtasks
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

describe('AgentSidebar 新建会话显式选 agent', () => {
  it('renders the AgentPicker with all three agents in the toolbar', async () => {
    const { container, root } = await mount();

    expect(container.querySelector('[data-agent-id="claude"]')).not.toBeNull();
    expect(container.querySelector('[data-agent-id="codex"]')).not.toBeNull();
    expect(container.querySelector('[data-agent-id="pi"]')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('defaults selection to the preferred agent (claude) and creates with it', async () => {
    const { container, root } = await mount();

    // 默认高亮 claude。
    const claudeButton = container.querySelector('[data-agent-id="claude"]')!.closest('button')!;
    expect(claudeButton.getAttribute('aria-pressed')).toBe('true');

    const createButton = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('新建会话'),
    )!;
    await act(async () => {
      createButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(createConversation).toHaveBeenCalledTimes(1);
    expect(createConversation.mock.calls[0][0]).toMatchObject({ agentType: 'claude' });

    act(() => root.unmount());
    container.remove();
  });

  it('creates a conversation with codex after selecting codex', async () => {
    const { container, root } = await mount();

    const codexButton = container.querySelector('[data-agent-id="codex"]')!.closest('button')!;
    act(() => {
      codexButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(codexButton.getAttribute('aria-pressed')).toBe('true');

    const createButton = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('新建会话'),
    )!;
    await act(async () => {
      createButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(createConversation).toHaveBeenCalledTimes(1);
    expect(createConversation.mock.calls[0][0]).toMatchObject({ agentType: 'codex' });

    act(() => root.unmount());
    container.remove();
  });
});
