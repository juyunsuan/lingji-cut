// @vitest-environment jsdom
//
// AssistantMessage 测试：block 分发 + agent 头 + 权限卡。
// 结构断言用 SSR（renderToStaticMarkup），交互用 jsdom + createRoot + act。
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantMessage } from '../src/components/agent/AssistantMessage';
import type { ConversationTurn, PendingPermission } from '../src/types/conversation';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 补 ui 库（如 Badge）在渲染时引用的 window.matchMedia 接口（jsdom 默认不实现）。
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

function makeTurn(overrides: Partial<ConversationTurn> = {}): ConversationTurn {
  return {
    id: 1,
    conversationId: 1,
    role: 'assistant',
    createdAt: '2026-01-01T00:00:00.000Z',
    blocks: [
      { type: 'text', text: '这是一段**回复**正文' },
      { type: 'thinking', text: '我先思考一下这个问题' },
      {
        type: 'tool_call',
        toolCallId: 'tc-1',
        title: 'read_text_file',
        kind: 'read',
        status: 'completed',
        rawInput: '{"path":"a.md"}',
      },
      { type: 'error', message: '工具执行失败：超时' },
    ],
    ...overrides,
  };
}

function makePending(overrides: Partial<PendingPermission> = {}): PendingPermission {
  return {
    requestId: 'req-99',
    toolCall: { title: 'write_text_file', rawInput: { path: 'b.md' } },
    options: [
      { optionId: 'opt-allow', name: '允许一次', kind: 'allow_once' },
      { optionId: 'opt-reject', name: '拒绝', kind: 'reject_once' },
    ],
    ...overrides,
  };
}

describe('AssistantMessage block 分发', () => {
  it('renders text / thinking / tool_call / error blocks', () => {
    const html = renderToStaticMarkup(<AssistantMessage turn={makeTurn()} />);
    // TextBlock（markdown 渲染出的正文片段）
    expect(html).toContain('回复');
    // ThinkingBlock（折叠头标签 + 字数）
    expect(html).toContain('思考过程');
    // ToolCallBlock（工具标题）
    expect(html).toContain('read_text_file');
    // ErrorBlock（错误文案）
    expect(html).toContain('工具执行失败：超时');
  });

  it('renders grouped file_changed blocks with a diff preview', () => {
    const html = renderToStaticMarkup(
      <AssistantMessage
        turn={makeTurn({
          blocks: [
            {
              type: 'file_changed',
              path: 'src/index.js',
              before: 'const a = 1;\nconst b = 2;',
              after: 'const a = 1;\nconst b = 3;',
            },
            {
              type: 'file_changed',
              path: 'src/other.js',
              before: 'old',
              after: 'new',
            },
          ],
        })}
      />,
    );
    expect(html).toContain('编辑了 2 个文件');
    expect(html).toContain('index.js');
    expect(html).toContain('src/other.js');
    expect(html).toContain('const b = 2;');
    expect(html).toContain('const b = 3;');
  });

  it('promotes consecutive edit/write/delete tool calls into a file change block', () => {
    const html = renderToStaticMarkup(
      <AssistantMessage
        turn={makeTurn({
          blocks: [
            {
              type: 'tool_call',
              toolCallId: 'edit-1',
              title: 'edit',
              kind: 'edit',
              status: 'completed',
              rawInput: '{"path":"src/a.ts","oldString":"old","newString":"new"}',
              rawOutput: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new',
            },
            {
              type: 'tool_call',
              toolCallId: 'write-1',
              title: 'write',
              kind: 'edit',
              status: 'completed',
              rawInput: '{"path":"src/b.ts","content":"hello\\nworld"}',
              rawOutput: 'Wrote src/b.ts',
            },
            {
              type: 'tool_call',
              toolCallId: 'delete-1',
              title: 'delete',
              kind: 'edit',
              status: 'completed',
              rawInput: '{"path":"src/c.ts"}',
              rawOutput: 'Deleted src/c.ts',
            },
          ],
        })}
      />,
    );

    expect(html).toContain('变更了 3 个文件');
    expect(html).toContain('a.ts');
    expect(html).toContain('src/b.ts');
    expect(html).toContain('src/c.ts');
    expect(html).not.toContain('工具调用');
  });

  it('groups consecutive command tool calls even when their titles differ', () => {
    const html = renderToStaticMarkup(
      <AssistantMessage
        turn={makeTurn({
          blocks: [
            {
              type: 'tool_call',
              toolCallId: 'cmd-1',
              title: 'bash',
              kind: 'execute',
              status: 'completed',
              rawInput: '{"command":"git diff --stat"}',
              rawOutput: '1 file changed',
            },
            {
              type: 'tool_call',
              toolCallId: 'cmd-2',
              title: 'exec_command',
              kind: 'execute',
              status: 'completed',
              rawInput: '{"cmd":"npm test -- --run tests/assistant-message.test.tsx"}',
              rawOutput: 'passed',
            },
          ],
        })}
      />,
    );

    expect(html).toContain('已运行 2 条命令');
  });

  it('promotes apply_patch style tool calls into a file change block', () => {
    const html = renderToStaticMarkup(
      <AssistantMessage
        turn={makeTurn({
          blocks: [
            {
              type: 'tool_call',
              toolCallId: 'patch-1',
              title: 'apply_patch',
              kind: 'edit',
              status: 'completed',
              rawInput: '*** Begin Patch\n*** Update File: src/patched.ts\n@@\n-old\n+new\n*** End Patch',
              rawOutput: 'Success. Updated the following files:\nM src/patched.ts',
            },
          ],
        })}
      />,
    );

    expect(html).toContain('编辑了 1 个文件');
    expect(html).toContain('patched.ts');
    expect(html).toContain('old');
    expect(html).toContain('new');
  });
});

describe('AssistantMessage agent 头', () => {
  it('renders Codex icon/name when turn.agentId is codex', () => {
    const html = renderToStaticMarkup(
      <AssistantMessage turn={makeTurn({ agentId: 'codex' })} />,
    );
    expect(html).toContain('aria-label="Codex"');
    expect(html).toContain('Codex');
  });

  it('prefers turn.agentName over agentId mapping', () => {
    const html = renderToStaticMarkup(
      <AssistantMessage turn={makeTurn({ agentId: 'codex', agentName: '我的助手' })} />,
    );
    expect(html).toContain('我的助手');
  });

  it('falls back to fallbackAgentId when turn has no agentId', () => {
    const turn = makeTurn();
    delete turn.agentId;
    const html = renderToStaticMarkup(
      <AssistantMessage turn={turn} fallbackAgentId="claude" />,
    );
    expect(html).toContain('aria-label="Claude"');
    expect(html).toContain('Claude');
  });
});

describe('AssistantMessage 复制按钮 + 文本可选中', () => {
  it('renders a 复制回复 button and allows text selection on content', () => {
    const html = renderToStaticMarkup(<AssistantMessage turn={makeTurn()} />);
    // 复制按钮（aria-label = 复制回复）
    expect(html).toContain('aria-label="复制回复"');
    // 显式允许鼠标拖拽选中文本（user-select: text）
    expect(html).toMatch(/user-select:\s*text/i);
  });

  it('does not render copy button when there is no text block', () => {
    const turn = makeTurn({
      blocks: [{ type: 'thinking', text: '只有思考没有正文' }],
    });
    const html = renderToStaticMarkup(<AssistantMessage turn={turn} />);
    expect(html).not.toContain('aria-label="复制回复"');
  });

  it('copies the joined text blocks to clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const turn = makeTurn({
      blocks: [
        { type: 'text', text: '第一段' },
        { type: 'thinking', text: '思考不计入复制' },
        { type: 'text', text: '第二段' },
      ],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<AssistantMessage turn={turn} />);
    });

    const copyButton = Array.from(container.querySelectorAll('button')).find(
      (el) => el.getAttribute('aria-label') === '复制回复',
    )!;
    expect(copyButton).toBeTruthy();
    act(() => {
      copyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(writeText).toHaveBeenCalledWith('第一段\n\n第二段');

    act(() => root.unmount());
    container.remove();
  });
});

describe('AssistantMessage 权限卡', () => {
  it('renders permission options when pendingPermission is provided', () => {
    const html = renderToStaticMarkup(
      <AssistantMessage turn={makeTurn()} pendingPermission={makePending()} />,
    );
    expect(html).toContain('需要你授权工具调用');
    expect(html).toContain('write_text_file');
    expect(html).toContain('允许一次');
    expect(html).toContain('拒绝');
  });

  it('does not render permission card when pendingPermission is null', () => {
    const html = renderToStaticMarkup(
      <AssistantMessage turn={makeTurn()} pendingPermission={null} />,
    );
    expect(html).not.toContain('需要你授权工具调用');
  });

  it('calls onRespondPermission with requestId + optionId on click', () => {
    const onRespond = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <AssistantMessage
          turn={makeTurn()}
          pendingPermission={makePending()}
          onRespondPermission={onRespond}
        />,
      );
    });

    const allowButton = Array.from(container.querySelectorAll('button')).find((el) =>
      el.textContent?.includes('允许一次'),
    )!;
    expect(allowButton).toBeTruthy();
    act(() => {
      allowButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onRespond).toHaveBeenCalledWith('req-99', 'opt-allow');

    act(() => root.unmount());
    container.remove();
  });
});
