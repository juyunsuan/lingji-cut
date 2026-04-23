// tests/auto-run-overlay.test.tsx
//
// 注意：项目测试环境为 vitest node + 静态 SSR（renderToStaticMarkup），
// 未引入 @testing-library/react / jsdom。此文件遵循项目惯例，使用 SSR
// 做结构断言；对受控组件的 onClick 等回调，通过直接调用 React 元素树
// 上的 props 函数进行验证（组件本身是纯函数式的、无内部状态）。
import { describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AutoRunOverlay, type AutoRunOverlayProps } from '../src/components/AutoRunOverlay';

function makeBaseProps(overrides: Partial<AutoRunOverlayProps> = {}): AutoRunOverlayProps {
  return {
    step: 'tts_generating',
    stepLabel: '合成语音',
    progress: 42,
    error: null,
    onCancel: vi.fn(),
    onJumpToScriptWorkbench: vi.fn(),
    onJumpToEditor: vi.fn(),
    ...overrides,
  };
}

/**
 * 把任意子节点（含字符串、数字、数组、片段）拍平成字符串数组，
 * 便于按文本内容匹配 React 元素。
 */
function collectText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return collectText(props?.children);
  }
  return '';
}

/**
 * 沿元素树查找首个 children 文本包含给定子串的可点击元素（带 onClick 的元素）。
 */
function findClickableByText(node: unknown, text: string): ReactElement | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findClickableByText(child, text);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const props = node.props as Record<string, unknown> | null;
  if (props && typeof props.onClick === 'function') {
    const flat = collectText(props.children as ReactNode);
    if (flat.includes(text)) return node;
  }
  if (props && 'children' in props) {
    return findClickableByText(props.children, text);
  }
  return null;
}

describe('AutoRunOverlay', () => {
  it('renders current step label and progress percent in HTML', () => {
    const html = renderToStaticMarkup(
      <AutoRunOverlay {...makeBaseProps({ stepLabel: '合成语音中', progress: 42.6 })} />,
    );
    expect(html).toContain('正在为你一键成稿');
    expect(html).toContain('合成语音中');
    // 整体进度百分比四舍五入展示
    expect(html).toContain('43%');
    // 步骤指示器容器存在
    expect(html).toContain('aria-label="step indicators"');
  });

  it('clicking cancel button triggers onCancel callback', () => {
    const onCancel = vi.fn();
    const tree = AutoRunOverlay(makeBaseProps({ onCancel }));
    const cancel = findClickableByText(tree, '取消');
    expect(cancel).not.toBeNull();
    const onClick = (cancel!.props as { onClick: () => void }).onClick;
    onClick();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('error on script_generating shows message and 查看脚本工作台 button', () => {
    const onJumpToScriptWorkbench = vi.fn();
    const props = makeBaseProps({
      step: 'error',
      error: { message: '生成口播稿失败', failedStep: 'script_generating' },
      onJumpToScriptWorkbench,
    });
    const html = renderToStaticMarkup(<AutoRunOverlay {...props} />);
    expect(html).toContain('生成口播稿失败');
    expect(html).toContain('查看脚本工作台');
    // 出错态不应出现取消按钮
    expect(html).not.toContain('>取消<');

    const tree = AutoRunOverlay(props);
    const jump = findClickableByText(tree, '查看脚本工作台');
    expect(jump).not.toBeNull();
    const onClick = (jump!.props as { onClick: () => void }).onClick;
    onClick();
    expect(onJumpToScriptWorkbench).toHaveBeenCalledTimes(1);
  });

  it('error on cover_generating shows 进入编辑器 button', () => {
    const onJumpToEditor = vi.fn();
    const props = makeBaseProps({
      step: 'error',
      error: { message: '封面生成失败', failedStep: 'cover_generating' },
      onJumpToEditor,
    });
    const html = renderToStaticMarkup(<AutoRunOverlay {...props} />);
    expect(html).toContain('封面生成失败');
    expect(html).toContain('进入编辑器');
    expect(html).not.toContain('查看脚本工作台');

    const tree = AutoRunOverlay(props);
    const jump = findClickableByText(tree, '进入编辑器');
    expect(jump).not.toBeNull();
    const onClick = (jump!.props as { onClick: () => void }).onClick;
    onClick();
    expect(onJumpToEditor).toHaveBeenCalledTimes(1);
  });

  it('fills first 3 segments at tts_done', () => {
    const html = renderToStaticMarkup(
      <AutoRunOverlay {...makeBaseProps({ step: 'tts_done', stepLabel: '', progress: 33 })} />,
    );
    // tts_done 应归一化为 tts_generating，前 3 段（douyin/script/tts）填蓝，其余 3 段灰色
    const filled = (html.match(/--color-system-blue/g) ?? []).length;
    expect(filled).toBe(3);
  });

  it('fills all 6 segments at done', () => {
    const html = renderToStaticMarkup(
      <AutoRunOverlay {...makeBaseProps({ step: 'done', stepLabel: '', progress: 100 })} />,
    );
    // done 状态下所有 6 段都应填满
    const filled = (html.match(/--color-system-blue/g) ?? []).length;
    expect(filled).toBe(6);
  });
});
