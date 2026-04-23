// tests/auto-mode-section.test.tsx
//
// 注意：项目测试环境为 vitest node + 静态 SSR（renderToStaticMarkup），
// 未引入 @testing-library/react / jsdom。此文件遵循项目惯例，使用 SSR
// 做结构断言；对受控组件的 onToggle / onChangeParams 行为，通过直接
// 调用 React 元素树上的 props 函数进行验证（组件本身是纯函数式的、
// 无内部状态）。
import { describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AutoModeSection, type AutoModeSectionProps } from '../src/components/script/AutoModeSection';

function makeBaseProps(overrides: Partial<AutoModeSectionProps> = {}): AutoModeSectionProps {
  return {
    enabled: false,
    onToggle: vi.fn(),
    params: { templateId: 'news-broadcast', roleId: 'none', voiceId: 'female-shaonv' },
    onChangeParams: vi.fn(),
    templateOptions: [
      { value: 'news-broadcast', label: '新闻播报' },
      { value: 'casual-talk', label: '轻松对话' },
    ],
    roleOptions: [
      { value: 'none', label: '默认' },
      { value: 'host', label: '主播' },
    ],
    voiceOptions: [
      { value: 'female-shaonv', label: '少女音' },
      { value: 'male-qn-qingse', label: '青涩青年男声' },
    ],
    ...overrides,
  };
}

/**
 * 在 React 元素树中按 aria-label 查找第一个匹配节点，
 * 用于在不依赖 DOM 的情况下读取受控组件的 props（含 onChange）。
 */
function findByAriaLabel(node: unknown, ariaLabel: string): ReactElement | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByAriaLabel(child, ariaLabel);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const props = node.props as Record<string, unknown> | null;
  if (props && (props['aria-label'] === ariaLabel || props.ariaLabel === ariaLabel)) {
    return node;
  }
  if (props && 'children' in props) {
    return findByAriaLabel(props.children, ariaLabel);
  }
  return null;
}

describe('AutoModeSection', () => {
  it('renders the toggle and hides params when disabled', () => {
    const html = renderToStaticMarkup(<AutoModeSection {...makeBaseProps()} />);
    // 复选框存在且未勾选
    expect(html).toContain('type="checkbox"');
    expect(html).not.toMatch(/type="checkbox"[^>]*checked/);
    expect(html).toContain('一键成稿');
    // 未启用时不渲染参数下拉
    expect(html).not.toContain('aria-label="写稿模板"');
    expect(html).not.toContain('aria-label="写稿角色"');
    expect(html).not.toContain('aria-label="TTS 音色"');
  });

  it('toggling fires onToggle with the new boolean state', () => {
    const onToggle = vi.fn();
    const tree = AutoModeSection(makeBaseProps({ onToggle }));
    const handler = findCheckboxOnChange(tree);
    expect(handler).toBeTypeOf('function');
    handler!({ target: { checked: true } } as unknown as React.ChangeEvent<HTMLInputElement>);
    expect(onToggle).toHaveBeenCalledWith(true);
    handler!({ target: { checked: false } } as unknown as React.ChangeEvent<HTMLInputElement>);
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  it('shows params when enabled and renders the current selections', () => {
    const html = renderToStaticMarkup(
      <AutoModeSection {...makeBaseProps({ enabled: true })} />,
    );
    // 复选框为勾选态
    expect(html).toMatch(/type="checkbox"[^>]*checked/);
    // 三个下拉均渲染
    expect(html).toContain('aria-label="写稿模板"');
    expect(html).toContain('aria-label="写稿角色"');
    expect(html).toContain('aria-label="TTS 音色"');
    // option 文案
    expect(html).toContain('新闻播报');
    expect(html).toContain('轻松对话');
    expect(html).toContain('少女音');
    expect(html).toContain('青涩青年男声');
    // 当前选中项被标记 selected
    expect(html).toMatch(/<option[^>]*value="news-broadcast"[^>]*selected/);
    expect(html).toMatch(/<option[^>]*value="none"[^>]*selected/);
    expect(html).toMatch(/<option[^>]*value="female-shaonv"[^>]*selected/);
  });

  it('emits onChangeParams with merged patch when a select changes', () => {
    const onChangeParams = vi.fn();
    const tree = AutoModeSection(
      makeBaseProps({ enabled: true, onChangeParams }),
    );
    const voice = findByAriaLabel(tree, 'TTS 音色');
    expect(voice).not.toBeNull();
    const onChange = (voice!.props as { onChange: (e: unknown) => void }).onChange;
    onChange({ target: { value: 'male-qn-qingse' } });
    expect(onChangeParams).toHaveBeenCalledWith({
      templateId: 'news-broadcast',
      roleId: 'none',
      voiceId: 'male-qn-qingse',
    });

    const template = findByAriaLabel(tree, '写稿模板');
    expect(template).not.toBeNull();
    const onTemplateChange = (template!.props as { onChange: (e: unknown) => void }).onChange;
    onTemplateChange({ target: { value: 'casual-talk' } });
    expect(onChangeParams).toHaveBeenLastCalledWith({
      templateId: 'casual-talk',
      roleId: 'none',
      voiceId: 'female-shaonv',
    });
  });
});

/**
 * 沿元素树查找首个 `<input type="checkbox">` 的 onChange 回调。
 */
function findCheckboxOnChange(
  node: unknown,
): ((e: React.ChangeEvent<HTMLInputElement>) => void) | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findCheckboxOnChange(child);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const props = node.props as Record<string, unknown> | null;
  if (
    node.type === 'input' &&
    props &&
    props.type === 'checkbox' &&
    typeof props.onChange === 'function'
  ) {
    return props.onChange as (e: React.ChangeEvent<HTMLInputElement>) => void;
  }
  if (props && 'children' in props) {
    return findCheckboxOnChange(props.children);
  }
  return null;
}
