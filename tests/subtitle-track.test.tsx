import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SubtitleTrack } from '../src/remotion/SubtitleTrack';
import type { SrtEntry, SubtitleHighlight, SubtitleStyle } from '../src/types';

let currentFrame = 15;

vi.mock('remotion', () => ({
  AbsoluteFill: ({ children }: { children: unknown }) => children,
  useCurrentFrame: () => currentFrame,
  useVideoConfig: () => ({ fps: 30 }),
}));

const entries: SrtEntry[] = [
  {
    index: 1,
    startMs: 0,
    endMs: 2_000,
    text: '中国品牌首次拿下世界冠军',
  },
];

const style: SubtitleStyle = {
  fontSize: 56,
  color: '#F8FAFC',
  position: 'bottom',
  highlightEnabled: true,
  highlightBackgroundColor: '#F8DC48',
  highlightTextColor: '#111827',
  highlightPaddingX: 10,
  highlightPaddingY: 4,
  highlightRadius: 12,
  highlightAnimation: 'pop',
  maxCharsPerEntry: 35,
  autoResegment: true,
};

describe('SubtitleTrack', () => {
  it('renders highlighted text as a separate segment when a valid highlight exists', () => {
    const html = renderToStaticMarkup(
      <SubtitleTrack
        entries={entries}
        style={style}
        highlights={[
          {
            entryIndex: 1,
            start: 8,
            end: 12,
            highlightText: '世界冠军',
            sourceText: '中国品牌首次拿下世界冠军',
          },
        ]}
      />,
    );

    expect(html).toContain('中国品牌首次拿下');
    expect(html).toContain('世界冠军');
    expect(html).toContain('data-subtitle-highlight="true"');
  });

  it('falls back to plain subtitle text when the highlight is expired', () => {
    const html = renderToStaticMarkup(
      <SubtitleTrack
        entries={entries}
        style={style}
        highlights={[
          {
            entryIndex: 1,
            start: 8,
            end: 12,
            highlightText: '世界冠军',
            sourceText: '中国品牌后来拿下世界冠军',
          },
        ]}
      />,
    );

    expect(html).toContain('中国品牌首次拿下世界冠军');
    expect(html).not.toContain('data-subtitle-highlight="true"');
  });

  it('animates the highlight from the subtitle start time instead of the global frame', () => {
    currentFrame = 31;

    const html = renderToStaticMarkup(
      <SubtitleTrack
        entries={[
          {
            index: 2,
            startMs: 1_000,
            endMs: 3_000,
            text: '真正值得记住的是世界冠军',
          },
        ]}
        style={style}
        highlights={[
          {
            entryIndex: 2,
            start: 8,
            end: 12,
            highlightText: '世界冠军',
            sourceText: '真正值得记住的是世界冠军',
          },
        ]}
      />,
    );

    expect(html).toContain('transform:scale(0.965)');
    currentFrame = 15;
  });
});
