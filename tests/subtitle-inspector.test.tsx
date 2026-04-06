import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SubtitleInspector } from '../src/components/SubtitleInspector';

vi.mock('../src/store/timeline', () => ({
  useTimelineStore: () => ({
    srtEntries: [{ index: 1, startMs: 0, endMs: 2_000, text: 'hello world' }],
    setSubtitleHighlights: () => undefined,
    updateSubtitleStyle: () => undefined,
    timeline: {
      podcast: {
        srtPath: '/tmp/test.srt',
      },
      subtitleHighlights: [
        {
          entryIndex: 1,
          start: 6,
          end: 11,
          highlightText: 'world',
          sourceText: 'hello world',
        },
      ],
      subtitle: {
        fontSize: 48,
        color: '#FFFFFF',
        position: 'bottom',
        highlightEnabled: true,
        highlightBackgroundColor: '#F8DC48',
        highlightTextColor: '#111827',
        highlightPaddingX: 10,
        highlightPaddingY: 4,
        highlightRadius: 12,
        highlightAnimation: 'pop',
      },
    },
  }),
}));

describe('SubtitleInspector', () => {
  it('renders the design-aligned subtitle highlight detail panel', () => {
    const html = renderToStaticMarkup(<SubtitleInspector />);

    expect(html).toContain('关键词高亮');
    expect(html).toContain('颜色与圆角');
    expect(html).toContain('动画与预览');
    expect(html).toContain('重新生成高亮');
    expect(html).toContain('高亮已生成');
    expect(html).toContain('启用高亮');
    expect(html).toContain('动画效果');
    expect(html).toContain('#F8DC48');
    expect(html).toContain('#111827');
    expect(html).toContain('关键词高亮');
    expect(html).toContain('test.srt');
    expect(html).not.toContain('这一句真正的重点是');
    expect(html).not.toContain('启用关键词高亮');
  });
});
