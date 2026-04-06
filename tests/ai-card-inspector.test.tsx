import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AICardInspector } from '../src/components/AICardInspector';

describe('AICardInspector', () => {
  it('renders the design-aligned sections, preview state and danger zone', () => {
    const html = renderToStaticMarkup(
      <AICardInspector
        card={{
          id: 'card-1',
          type: 'summary',
          title: 'AI 驱动的未来',
          content: '人工智能正在改变我们的创作方式。',
          startMs: 0,
          endMs: 45_000,
          displayDurationMs: 5_000,
          displayMode: 'fullscreen',
          template: 'summary-default',
          enabled: true,
          style: {
            primaryColor: '#6366f1',
            backgroundColor: '#0f172a',
            fontSize: 48,
          },
        }}
        onRegenerate={async () => null}
        onSave={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(html).toContain('data-ai-card-section="text-content"');
    expect(html).toContain('data-ai-card-section="display-settings"');
    expect(html).toContain('data-ai-card-section="preview"');
    expect(html).toContain('data-ai-card-section="danger"');
    expect(html).toContain('文字内容');
    expect(html).toContain('展示设置');
    expect(html).toContain('网页卡片预览');
    expect(html).toContain('危险操作');
    expect(html).toContain('卡片预览区');
    expect(html).toContain('全屏模式');
    expect(html).toContain('重新生成');
    expect(html).toContain('保存');
    expect(html).toContain('删除此卡片');
  });
});
