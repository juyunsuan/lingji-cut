import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AICardEditModal } from '../src/components/AICardEditModal';

describe('AICardEditModal', () => {
  it('renders editing fields for the selected ai card', () => {
    const html = renderToStaticMarkup(
      <AICardEditModal
        visible
        card={{
          id: 'card-1',
          type: 'summary',
          title: '本期要点',
          content: '重点内容',
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
          webCard: {
            srcDoc: '<!doctype html><html><body><h1>预览</h1></body></html>',
          },
        }}
        isRegenerating={false}
        previewWidth={1080}
        previewHeight={1920}
        onClose={() => undefined}
        onRegenerate={async () => null}
        onSave={() => undefined}
      />,
    );

    expect(html).toContain('编辑卡片');
    expect(html).toContain('展示时长（秒）');
    expect(html).toContain('展示方式');
    expect(html).toContain('单卡追加提示词');
    expect(html).toContain('网页卡片预览');
    expect(html).toContain('全屏位置预览');
    expect(html).toContain('重新生成此卡');
    expect(html).toContain('aspect-ratio:1080 / 1920');
    expect(html).toContain('data-web-card-normalized=&quot;true&quot;');
    expect(html).toContain('width:100%');
    expect(html).toContain('height:100%');
  });

  it('shows a loading mask over the web-card preview while regenerating', () => {
    const html = renderToStaticMarkup(
      <AICardEditModal
        visible
        card={{
          id: 'card-1',
          type: 'summary',
          title: '本期要点',
          content: '重点内容',
          startMs: 0,
          endMs: 45_000,
          displayDurationMs: 5_000,
          displayMode: 'pip',
          template: 'summary-default',
          enabled: true,
          style: {
            primaryColor: '#6366f1',
            backgroundColor: '#0f172a',
            fontSize: 48,
          },
          webCard: {
            srcDoc: '<!doctype html><html><body><h1>预览</h1></body></html>',
          },
        }}
        isRegenerating
        previewWidth={1920}
        previewHeight={1080}
        onClose={() => undefined}
        onRegenerate={async () => null}
        onSave={() => undefined}
      />,
    );

    expect(html).toContain('正在重生成网页卡片...');
    expect(html).toContain('aria-busy="true"');
  });
});
