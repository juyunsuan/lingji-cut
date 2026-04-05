import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDefaultTimeline } from '../src/types';
import { useTimelineStore } from '../src/store/timeline';
import { PreviewPanel } from '../src/components/PreviewPanel';

vi.mock('@remotion/player', async () => {
  const React = await import('react');

  return {
    Player: ({ compositionWidth, compositionHeight }: { compositionWidth: number; compositionHeight: number }) =>
      React.createElement(
        'div',
        {
          'data-player': 'mock',
          'data-size': `${compositionWidth}x${compositionHeight}`,
        },
        'Mock Player',
      ),
  };
});

describe('PreviewPanel', () => {
  beforeEach(() => {
    const timeline = createDefaultTimeline();
    timeline.podcast.durationMs = 90_000;

    useTimelineStore.setState({
      timeline,
      srtEntries: [],
      assets: [],
    });
  });

  it('renders playback and export controls beneath the preview player', () => {
    const html = renderToStaticMarkup(
      <PreviewPanel
        playerRef={{ current: null }}
        isPlaying={false}
        onTogglePlay={() => undefined}
        onExport={() => undefined}
        currentTimeMs={15_000}
        durationMs={90_000}
        compact={false}
      />,
    );

    expect(html).toContain('播放');
    expect(html).toContain('00:15 / 01:30');
    expect(html).toContain('aria-label="导出 MP4"');
    expect(html).toContain('data-size="1920x1080"');
  });
});
