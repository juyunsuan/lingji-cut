// @vitest-environment jsdom
//
// ToolCallBlock（op-card 风格）测试：
//  - 状态徽章三态：running/pending → spinner；completed → 绿 check；failed/error → 红 X。
//  - 标题渲染工具名。
//  - 含 rawInput/rawOutput 时折叠区存在，点击卡头可展开。
// 结构断言用 SSR（renderToStaticMarkup），交互用 jsdom + createRoot + act。
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { ToolCallBlock } from '../src/components/agent/ToolCallBlock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 补 ui 库依赖链可能引用的 window.matchMedia（jsdom 默认不实现）。
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

interface Block {
  type: 'tool_call';
  toolCallId: string;
  title: string;
  kind: string;
  status: string;
  rawInput?: string;
  rawOutput?: string;
}

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    type: 'tool_call',
    toolCallId: 'tc-1',
    title: 'read_text_file',
    kind: 'read',
    status: 'completed',
    ...overrides,
  };
}

describe('ToolCallBlock 状态徽章', () => {
  it('running 状态渲染运行中状态', () => {
    const html = renderToStaticMarkup(
      <ToolCallBlock block={makeBlock({ status: 'in_progress' })} />,
    );
    expect(html).toContain('aria-label="运行中"');
    expect(html).toContain('运行中');
  });

  it('pending 状态也按运行中处理', () => {
    const html = renderToStaticMarkup(
      <ToolCallBlock block={makeBlock({ status: 'pending' })} />,
    );
    expect(html).toContain('aria-label="运行中"');
  });

  it('completed 状态渲染已完成状态', () => {
    const html = renderToStaticMarkup(
      <ToolCallBlock block={makeBlock({ status: 'completed' })} />,
    );
    expect(html).toContain('aria-label="已完成"');
    expect(html).toContain('已完成');
  });

  it('failed/error 状态渲染失败状态', () => {
    const failed = renderToStaticMarkup(
      <ToolCallBlock block={makeBlock({ status: 'failed' })} />,
    );
    expect(failed).toContain('aria-label="失败"');
    expect(failed).toContain('调用失败');

    const error = renderToStaticMarkup(
      <ToolCallBlock block={makeBlock({ status: 'error' })} />,
    );
    expect(error).toContain('aria-label="失败"');
  });
});

describe('ToolCallBlock 标题与元信息', () => {
  it('渲染工具名（title）', () => {
    const html = renderToStaticMarkup(<ToolCallBlock block={makeBlock()} />);
    expect(html).toContain('读取文件');
    expect(html).toContain('read_text_file');
  });

  it('运行时缺少 title/kind/status 时不崩溃并渲染兜底文案', () => {
    const block = makeBlock({
      title: undefined,
      kind: undefined,
      status: undefined,
    } as Partial<Block>);

    const html = renderToStaticMarkup(<ToolCallBlock block={block as Block} />);

    expect(html).toContain('工具调用');
    expect(html).toContain('运行中');
  });

  it('渲染 kind 作为 meta', () => {
    const html = renderToStaticMarkup(
      <ToolCallBlock block={makeBlock({ title: 'write', kind: 'edit', rawInput: '{"path":"a.md","content":"x"}' })} />,
    );
    expect(html).toContain('写入文件');
    expect(html).toContain('a.md');
  });

  it('Bash 工具渲染为命令执行摘要', () => {
    const html = renderToStaticMarkup(
      <ToolCallBlock
        block={makeBlock({
          title: 'Bash',
          kind: 'execute',
          rawInput: '{"command":"npm test"}',
        })}
      />,
    );
    expect(html).toContain('执行命令');
    expect(html).toContain('已执行');
    expect(html).toContain('npm test');
  });

  it('PI edit 工具渲染为文件编辑摘要和 diff 统计', () => {
    const html = renderToStaticMarkup(
      <ToolCallBlock
        block={makeBlock({
          title: 'edit',
          kind: 'edit',
          rawInput: '{"path":"src/foo.ts","oldString":"old","newString":"new"}',
          rawOutput: '--- a/src/foo.ts\n+++ b/src/foo.ts\n-old\n+new\n+extra',
        })}
      />,
    );

    expect(html).toContain('编辑文件');
    expect(html).toContain('src/foo.ts');
    expect(html).toContain('+1 / -1');
  });

  it('展开 PI edit 时展示 old/new diff，不展示 Target 和成功提示当作 diff', () => {
    const html = renderToStaticMarkup(
      <ToolCallBlock
        block={makeBlock({
          title: 'edit',
          kind: 'edit',
          status: 'failed',
          rawInput: '{"path":"original.md","oldString":"原稿","newString":"你好，原稿"}',
          rawOutput: 'Successfully replaced 1 block(s) in original.md.',
        })}
      />,
    );

    expect(html).toContain('original.md');
    expect(html).toContain('原稿');
    expect(html).toContain('你好，原稿');
    expect(html).not.toContain('Target');
    expect(html).not.toContain('Successfully replaced');
  });
});

describe('ToolCallBlock 折叠展开', () => {
  it('failed 默认展开，rawInput/rawOutput 可见', () => {
    const html = renderToStaticMarkup(
      <ToolCallBlock
        block={makeBlock({
          status: 'failed',
          rawInput: '{"path":"a.md"}',
          rawOutput: 'permission denied',
        })}
      />,
    );
    expect(html).toContain('Target');
    expect(html).toContain('a.md');
    expect(html).toContain('Output');
    expect(html).toContain('permission denied');
  });

  it('展开 PI bash 工具时显示 Shell 块而不是裸 Input JSON 或 Command/Output 分组', () => {
    const html = renderToStaticMarkup(
      <ToolCallBlock
        block={makeBlock({
          title: 'bash',
          kind: 'execute',
          status: 'failed',
          rawInput: '{"command":"npm run build"}',
          rawOutput: 'build failed',
        })}
      />,
    );

    expect(html).toContain('Shell');
    expect(html).toContain('$ npm run build');
    expect(html).toContain('npm run build');
    expect(html).not.toContain('Command');
    expect(html).not.toContain('Output');
    expect(html).not.toContain('{&quot;command&quot;:&quot;npm run build&quot;}');
  });

  it('completed 默认折叠，点击卡头展开后可见 rawInput', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <ToolCallBlock
          block={makeBlock({
            status: 'completed',
            rawInput: '{"path":"b.md"}',
          })}
        />,
      );
    });

    // 默认折叠：详情区不可见，但目标预览会露出。
    expect(container.textContent).toContain('目标');
    expect(container.textContent).not.toContain('Input');

    const head = container.querySelector('button')!;
    expect(head).toBeTruthy();
    act(() => {
      head.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // 展开后 input 可见。
    expect(container.textContent).toContain('b.md');

    act(() => root.unmount());
    container.remove();
  });

  it('无 input/output 时卡头禁用且无折叠区', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<ToolCallBlock block={makeBlock({ status: 'completed' })} />);
    });
    const head = container.querySelector('button') as HTMLButtonElement;
    expect(head.disabled).toBe(true);
    act(() => root.unmount());
    container.remove();
  });
});
