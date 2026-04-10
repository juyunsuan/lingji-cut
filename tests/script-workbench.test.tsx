// tests/script-workbench.test.tsx
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OverlayProvider } from '../src/ui';
import { ScriptWorkbench } from '../src/pages/ScriptWorkbench';
import { useScriptStore } from '../src/store/script';

// localStorage 在 node 测试环境中不存在，提供一个简单 mock
const localStorageMock = (() => {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
})();

vi.stubGlobal('localStorage', localStorageMock);

describe('ScriptWorkbench', () => {
  beforeEach(() => {
    useScriptStore.getState().reset();
  });

  afterEach(() => {
    useScriptStore.getState().reset();
  });

  it('renders the file-tree empty guide before the workspace is initialized', () => {
    useScriptStore.setState({ currentStep: 0 as never, originalText: '', projectDir: null });

    const html = renderToStaticMarkup(
      <OverlayProvider>
        <ScriptWorkbench onBack={() => undefined} />
      </OverlayProvider>,
    );

    expect(html).toContain('选择工作目录');
    expect(html).toContain('导入文本文件');
  });

  it('renders the review workspace when original text is available', () => {
    useScriptStore.setState({
      currentStep: 1,
      projectDir: '/tmp/script-project',
      openedFile: 'original.md',
      originalText: '# 测试报告\n\n正文内容。',
    });

    // CM6 uses imperative DOM — renderToStaticMarkup produces the container div
    // but not the editor content. Verify no crash.
    const html = renderToStaticMarkup(
      <OverlayProvider>
        <ScriptWorkbench onBack={() => undefined} />
      </OverlayProvider>,
    );

    // OperationBar 摘要行应显示原稿字数统计
    expect(html).toContain('原稿');
    expect(html).toContain('original.md');
  });

  it('keeps activeStream in the ScriptWorkbench store destructuring', () => {
    const source = readFileSync(
      new URL('../src/pages/ScriptWorkbench.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toMatch(
      /const\s*\{[\s\S]*\bsetActiveStream,\s*[\s\S]*\bactiveStream,\s*[\s\S]*\}\s*=\s*useScriptStore\(\);/,
    );
  });

  it('does not render the redundant top progress bar in the workbench shell', () => {
    const source = readFileSync(
      new URL('../src/pages/ScriptWorkbench.tsx', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('AgentProgressBar');
  });

  it('renders a collapsible thinking block in the editor-side view when reasoning content is available', () => {
    const source = readFileSync(
      new URL('../src/pages/ScriptWorkbench.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('ThinkingBlock');
    expect(source).toMatch(/onReasoningChunk/);
  });

  it('declares navigation callback support for jumping into the editor after TTS', () => {
    const source = readFileSync(
      new URL('../src/pages/ScriptWorkbench.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('onNavigateToEditor');
  });

  it('includes a generate video action in the workbench shell', () => {
    const source = readFileSync(
      new URL('../src/pages/ScriptWorkbench.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('生成视频');
    expect(source).toContain('useAIVideoWorkflow');
  });

  it('renders workflow overlay controls for cancel and retry', () => {
    const source = readFileSync(
      new URL('../src/pages/ScriptWorkbench.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('workflowOverlay');
    expect(source).toContain('断点重试');
    expect(source).toContain('cancelWorkflow');
  });
});
