// @vitest-environment jsdom
//
// ChatComposer 测试：
// - 渲染 MessageInput 核心（文本输入框）。
// - showAgentPicker=true 时渲染 AgentPicker；false 时不渲染。
// - 选 agent → onAgentChange 透传。
// 用最小必要 props（不传 projectDir，避免触发 @ 文件树加载）；
// AgentPicker 的可用性探测通过 mock window.agentAPI.runPreflight 注入。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatComposer } from '../src/components/agent/ChatComposer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const runPreflight = vi.fn();

beforeEach(() => {
  runPreflight.mockReset();
  runPreflight.mockResolvedValue([{ label: 'CLI', status: 'pass', message: 'ok' }]);
  (window as unknown as { agentAPI: { runPreflight: typeof runPreflight } }).agentAPI = {
    runPreflight,
  };
});

afterEach(() => {
  delete (window as unknown as { agentAPI?: unknown }).agentAPI;
});

interface MountProps {
  onSend?: (blocks: unknown[]) => void;
  showAgentPicker?: boolean;
  selectedAgentId?: string;
  onAgentChange?: (id: string) => void;
}

async function mount(props: MountProps) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ChatComposer
        onSend={props.onSend ?? (() => undefined)}
        showAgentPicker={props.showAgentPicker}
        selectedAgentId={props.selectedAgentId}
        onAgentChange={props.onAgentChange}
      />,
    );
  });
  // 等待 AgentPicker 挂载时的 preflight Promise 解析。
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

describe('ChatComposer', () => {
  it('renders the MessageInput core (textarea)', async () => {
    const { container, root } = await mount({});

    expect(container.querySelector('textarea')).not.toBeNull();
    // 发送按钮也属于 MessageInput 核心。
    expect(container.querySelector('button[aria-label="发送"]')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('does NOT render AgentPicker when showAgentPicker is false', async () => {
    const { container, root } = await mount({ showAgentPicker: false });

    expect(container.querySelector('.agent-picker')).toBeNull();
    // 仍保留 MessageInput。
    expect(container.querySelector('textarea')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('renders AgentPicker when showAgentPicker is true', async () => {
    const { container, root } = await mount({ showAgentPicker: true, selectedAgentId: 'claude' });

    expect(container.querySelector('.agent-picker')).not.toBeNull();
    expect(container.querySelector('[data-agent-id="claude"]')).not.toBeNull();
    expect(container.querySelector('[data-agent-id="codex"]')).not.toBeNull();
    // MessageInput 仍然存在。
    expect(container.querySelector('textarea')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('forwards agent selection through onAgentChange', async () => {
    const onAgentChange = vi.fn();
    const { container, root } = await mount({
      showAgentPicker: true,
      selectedAgentId: 'claude',
      onAgentChange,
    });

    const codexButton = container
      .querySelector('[data-agent-id="codex"]')!
      .closest('button')!;
    act(() => {
      codexButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAgentChange).toHaveBeenCalledWith('codex');

    act(() => root.unmount());
    container.remove();
  });
});
