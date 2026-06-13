// @vitest-environment jsdom
//
// AgentPicker 测试：候选渲染 / 选择回调 / 当前高亮 / 可用性置灰。
// 交互用 jsdom + createRoot + act；可用性通过 mock window.agentAPI.runPreflight 注入。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AgentPicker } from '../src/components/agent/AgentPicker';

// 让 React 在 jsdom 下识别 act() 边界。
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const runPreflight = vi.fn();

beforeEach(() => {
  runPreflight.mockReset();
  // 默认：全部 agent 可用（pass）。
  runPreflight.mockResolvedValue([{ label: 'CLI', status: 'pass', message: 'ok' }]);
  (window as unknown as { agentAPI: { runPreflight: typeof runPreflight } }).agentAPI = {
    runPreflight,
  };
});

afterEach(() => {
  delete (window as unknown as { agentAPI?: unknown }).agentAPI;
});

/** 挂载并等待挂载时的 preflight Promise 解析（flush microtasks）。 */
async function mount(props: { value: string; onChange: (id: string) => void }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<AgentPicker value={props.value} onChange={props.onChange} />);
  });
  // 等待 Promise.all(runPreflight) 解析后的 setState。
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

describe('AgentPicker', () => {
  it('renders all three agents (claude / codex / pi)', async () => {
    const { container, root } = await mount({ value: 'claude', onChange: () => undefined });

    const text = container.textContent ?? '';
    expect(text).toContain('Claude');
    expect(text).toContain('Codex');
    expect(text).toContain('Pi');

    // 每个候选携带 data-agent-id，便于定位。
    expect(container.querySelector('[data-agent-id="claude"]')).not.toBeNull();
    expect(container.querySelector('[data-agent-id="codex"]')).not.toBeNull();
    expect(container.querySelector('[data-agent-id="pi"]')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('calls onChange with the agent id when an item is clicked', async () => {
    const onChange = vi.fn();
    const { container, root } = await mount({ value: 'claude', onChange });

    const codexLabel = container.querySelector('[data-agent-id="codex"]')!;
    const button = codexLabel.closest('button')!;
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith('codex');

    act(() => root.unmount());
    container.remove();
  });

  it('highlights the current value via aria-pressed', async () => {
    const { container, root } = await mount({ value: 'codex', onChange: () => undefined });

    const codexButton = container.querySelector('[data-agent-id="codex"]')!.closest('button')!;
    const claudeButton = container.querySelector('[data-agent-id="claude"]')!.closest('button')!;
    expect(codexButton.getAttribute('aria-pressed')).toBe('true');
    expect(claudeButton.getAttribute('aria-pressed')).toBe('false');

    act(() => root.unmount());
    container.remove();
  });

  it('disables an agent whose preflight fails and shows the install guide tooltip', async () => {
    // pi 探测失败（未安装），其余通过。
    runPreflight.mockImplementation(async (agentId?: string) => {
      if (agentId === 'pi') {
        return [{ label: 'CLI', status: 'fail', message: 'pi not found' }];
      }
      return [{ label: 'CLI', status: 'pass', message: 'ok' }];
    });

    const onChange = vi.fn();
    const { container, root } = await mount({ value: 'claude', onChange });

    const piLabel = container.querySelector('[data-agent-id="pi"]')! as HTMLElement;
    const piButton = piLabel.closest('button') as HTMLButtonElement;

    // 置灰：按钮 disabled + 标注 unavailable。
    expect(piButton.disabled).toBe(true);
    expect(piLabel.getAttribute('data-availability')).toBe('unavailable');
    // tooltip 使用 installGuide（包含 pi 安装提示）。
    expect(piLabel.getAttribute('title') ?? '').toContain('pi');

    // 可用的 agent 不被禁用。
    const claudeButton = container.querySelector('[data-agent-id="claude"]')!.closest('button') as HTMLButtonElement;
    expect(claudeButton.disabled).toBe(false);

    act(() => root.unmount());
    container.remove();
  });
});
