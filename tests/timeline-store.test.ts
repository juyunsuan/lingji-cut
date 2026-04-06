import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_VISUAL_TRACK_ID,
  createDefaultTimeline,
} from '../src/types';
import { useTimelineStore } from '../src/store/timeline';

describe('useTimelineStore', () => {
  beforeEach(() => {
    useTimelineStore.setState({
      timeline: createDefaultTimeline(),
      srtEntries: [],
      assets: [],
    });
  });

  it('creates default subtitle highlight settings', () => {
    expect(createDefaultTimeline().subtitle).toEqual({
      fontSize: 48,
      color: '#FFFFFF',
      position: 'bottom',
      highlightEnabled: false,
      highlightBackgroundColor: '#F8DC48',
      highlightTextColor: '#111827',
      highlightPaddingX: 10,
      highlightPaddingY: 4,
      highlightRadius: 12,
      highlightAnimation: 'pop',
    });
    expect(createDefaultTimeline().subtitleHighlights).toEqual([]);
  });

  it('sets podcast metadata', () => {
    useTimelineStore.getState().setPodcast('/tmp/audio.mp3', '/tmp/subtitles.srt', 12000);

    expect(useTimelineStore.getState().timeline.podcast).toEqual({
      audioPath: '/tmp/audio.mp3',
      srtPath: '/tmp/subtitles.srt',
      durationMs: 12000,
    });
    expect(useTimelineStore.getState().assets).toEqual([
      {
        path: '/tmp/audio.mp3',
        type: 'audio',
        name: 'audio.mp3',
        durationMs: 12000,
        locked: true,
      },
      {
        path: '/tmp/subtitles.srt',
        type: 'srt',
        name: 'subtitles.srt',
        durationMs: 12000,
        locked: true,
      },
    ]);
  });

  it('stores imported assets and uses their durations for overlays', () => {
    const store = useTimelineStore.getState();
    store.addAsset('/tmp/intro.mp4', 'video', 9000);
    const overlayId = store.addOverlay({
      type: 'video',
      assetPath: '/tmp/intro.mp4',
      trackId: DEFAULT_VISUAL_TRACK_ID,
      startMs: 3000,
      durationMs: 9000,
      position: { x: 0, y: 0, width: 1920, height: 1080 },
    });

    expect(useTimelineStore.getState().assets).toEqual([
      {
        path: '/tmp/intro.mp4',
        type: 'video',
        name: 'intro.mp4',
        durationMs: 9000,
      },
    ]);
    expect(overlayId).toBeTruthy();
    expect(useTimelineStore.getState().timeline.overlays[0]?.assetPath).toBe('/tmp/intro.mp4');
  });

  it('updates and removes overlays', () => {
    const store = useTimelineStore.getState();
    const newTrackId = store.addTrack();
    const overlayId = store.addOverlay({
      type: 'image',
      assetPath: '/tmp/cover.png',
      trackId: DEFAULT_VISUAL_TRACK_ID,
      startMs: 0,
      durationMs: 5000,
      position: { x: 10, y: 20, width: 300, height: 200 },
    });

    store.updateOverlay(overlayId, { startMs: 2000, durationMs: 7000, trackId: newTrackId });
    expect(useTimelineStore.getState().timeline.overlays[0]).toMatchObject({
      id: overlayId,
      startMs: 2000,
      durationMs: 7000,
      trackId: newTrackId,
    });

    store.removeOverlay(overlayId);
    expect(useTimelineStore.getState().timeline.overlays).toEqual([]);
  });

  it('removes dependent overlays when deleting an imported asset', () => {
    const store = useTimelineStore.getState();
    store.addAsset('/tmp/cover.png', 'image', 5000);
    store.addOverlay({
      type: 'image',
      assetPath: '/tmp/cover.png',
      trackId: DEFAULT_VISUAL_TRACK_ID,
      startMs: 0,
      durationMs: 5000,
      position: { x: 10, y: 20, width: 300, height: 200 },
    });

    store.removeAsset('/tmp/cover.png');

    expect(useTimelineStore.getState().timeline.overlays).toEqual([]);
    expect(useTimelineStore.getState().assets).toEqual([]);
  });

  it('undoes and redoes overlay edits', () => {
    const store = useTimelineStore.getState();
    const overlayId = store.addOverlay({
      type: 'image',
      assetPath: '/tmp/cover.png',
      trackId: DEFAULT_VISUAL_TRACK_ID,
      startMs: 0,
      durationMs: 5000,
      position: { x: 10, y: 20, width: 300, height: 200 },
    });

    store.updateOverlay(overlayId, { startMs: 2000, durationMs: 7000 });
    store.undo();

    expect(useTimelineStore.getState().timeline.overlays[0]).toMatchObject({
      id: overlayId,
      startMs: 0,
      durationMs: 5000,
    });
    expect(useTimelineStore.getState().canUndo).toBe(true);
    expect(useTimelineStore.getState().canRedo).toBe(true);

    store.redo();

    expect(useTimelineStore.getState().timeline.overlays[0]).toMatchObject({
      id: overlayId,
      startMs: 2000,
      durationMs: 7000,
    });
  });

  it('stores subtitle highlights and keeps them in undo history', () => {
    const store = useTimelineStore.getState();
    const highlight = {
      entryIndex: 1,
      start: 8,
      end: 12,
      highlightText: '世界冠军',
      sourceText: '中国品牌首次拿下世界冠军',
    };

    store.setSubtitleHighlights([highlight]);

    expect(useTimelineStore.getState().timeline.subtitleHighlights).toEqual([highlight]);

    store.undo();
    expect(useTimelineStore.getState().timeline.subtitleHighlights).toEqual([]);

    store.redo();
    expect(useTimelineStore.getState().timeline.subtitleHighlights).toEqual([highlight]);
  });

  it('clears subtitle highlights through a committed timeline update', () => {
    const store = useTimelineStore.getState();

    store.setSubtitleHighlights([
      {
        entryIndex: 1,
        start: 8,
        end: 12,
        highlightText: '世界冠军',
        sourceText: '中国品牌首次拿下世界冠军',
      },
    ]);

    store.clearSubtitleHighlights();

    expect(useTimelineStore.getState().timeline.subtitleHighlights).toEqual([]);
    expect(useTimelineStore.getState().canUndo).toBe(true);
  });

  it('updates subtitle style through a committed timeline update', () => {
    const store = useTimelineStore.getState();

    store.updateSubtitleStyle({
      highlightEnabled: true,
      highlightBackgroundColor: '#FFD400',
    });

    expect(useTimelineStore.getState().timeline.subtitle).toMatchObject({
      highlightEnabled: true,
      highlightBackgroundColor: '#FFD400',
      highlightAnimation: 'pop',
    });
    expect(useTimelineStore.getState().canUndo).toBe(true);
  });

  it('migrates legacy timelines without tracks and backfills overlay track ids', () => {
    useTimelineStore.getState().setTimeline({
      version: 1,
      fps: 30,
      width: 1920,
      height: 1080,
      podcast: {
        audioPath: '/tmp/audio.mp3',
        srtPath: '/tmp/subtitles.srt',
        durationMs: 12000,
      },
      overlays: [
        {
          id: 'legacy-overlay',
          type: 'image',
          assetPath: '/tmp/cover.png',
          startMs: 0,
          durationMs: 5000,
          position: { x: 0, y: 0, width: 1920, height: 1080 },
        },
      ],
      subtitle: {
        fontSize: 48,
        color: '#FFFFFF',
        position: 'bottom',
      },
    } as never);

    const { assets, timeline } = useTimelineStore.getState();

    expect(timeline.version).toBe(2);
    expect(timeline.tracks.map((track) => track.id)).toEqual(['audio', 'subtitle', 'visual-1']);
    expect(timeline.overlays[0]?.trackId).toBe(DEFAULT_VISUAL_TRACK_ID);
    expect(timeline.subtitle).toEqual({
      fontSize: 48,
      color: '#FFFFFF',
      position: 'bottom',
      highlightEnabled: false,
      highlightBackgroundColor: '#F8DC48',
      highlightTextColor: '#111827',
      highlightPaddingX: 10,
      highlightPaddingY: 4,
      highlightRadius: 12,
      highlightAnimation: 'pop',
    });
    expect(timeline.subtitleHighlights).toEqual([]);
    expect(assets.map((asset) => asset.path)).toEqual([
      '/tmp/audio.mp3',
      '/tmp/subtitles.srt',
      '/tmp/cover.png',
    ]);
  });

  it('adds visual tracks and attaches overlays to the chosen track', () => {
    const store = useTimelineStore.getState();
    const newTrackId = store.addTrack();

    expect(useTimelineStore.getState().timeline.tracks.find((track) => track.id === newTrackId))
      .toMatchObject({
        id: newTrackId,
        kind: 'visual',
        order: 2,
      });

    const overlayId = store.addOverlay({
      type: 'video',
      assetPath: '/tmp/intro.mp4',
      trackId: newTrackId,
      startMs: 1000,
      durationMs: 4000,
      position: { x: 0, y: 0, width: 1920, height: 1080 },
    });

    expect(useTimelineStore.getState().timeline.overlays.find((overlay) => overlay.id === overlayId))
      .toMatchObject({
        trackId: newTrackId,
      });
  });

  it('adds ai-card overlays without creating phantom media assets', () => {
    const store = useTimelineStore.getState();

    store.addAICardsToTimeline([
      {
        sourceCardId: 'ai-card-1',
        startMs: 2_000,
        durationMs: 5_000,
        aiCardData: {
          sourceCardId: 'ai-card-1',
          cardType: 'summary',
          title: '总结卡',
          content: '重点内容',
          template: 'summary-default',
          displayMode: 'fullscreen',
          style: {
            primaryColor: '#6366f1',
            backgroundColor: '#0f172a',
            fontSize: 48,
          },
        },
      },
    ]);

    expect(useTimelineStore.getState().timeline.overlays[0]).toMatchObject({
      overlayType: 'ai-card',
    });
    expect(useTimelineStore.getState().timeline.overlays[0]?.id).toMatch(/^ai-card-1-/);
    expect(useTimelineStore.getState().timeline.overlays[0]?.aiCardData?.sourceCardId).toBe(
      'ai-card-1',
    );
    expect(useTimelineStore.getState().assets).toEqual([]);
  });

  it('updates the existing overlay when applying the same ai card multiple times', () => {
    const store = useTimelineStore.getState();

    store.addAICardsToTimeline([
      {
        sourceCardId: 'ai-card-1',
        startMs: 2_000,
        durationMs: 5_000,
        aiCardData: {
          sourceCardId: 'ai-card-1',
          cardType: 'summary',
          title: '总结卡',
          content: '重点内容',
          template: 'summary-default',
          displayMode: 'fullscreen',
          style: {
            primaryColor: '#6366f1',
            backgroundColor: '#0f172a',
            fontSize: 48,
          },
        },
      },
    ]);
    store.addAICardsToTimeline([
      {
        sourceCardId: 'ai-card-1',
        startMs: 8_000,
        durationMs: 5_000,
        aiCardData: {
          sourceCardId: 'ai-card-1',
          cardType: 'summary',
          title: '总结卡',
          content: '重点内容',
          template: 'summary-default',
          displayMode: 'fullscreen',
          style: {
            primaryColor: '#6366f1',
            backgroundColor: '#0f172a',
            fontSize: 48,
          },
        },
      },
    ]);

    expect(useTimelineStore.getState().timeline.overlays).toHaveLength(1);
    expect(useTimelineStore.getState().timeline.overlays[0]).toMatchObject({
      startMs: 8_000,
      durationMs: 5_000,
      overlayType: 'ai-card',
    });
  });

  it('uses a smaller bottom-right layout when the ai card display mode is pip', () => {
    const store = useTimelineStore.getState();

    store.addAICardsToTimeline([
      {
        sourceCardId: 'ai-card-pip',
        startMs: 2_000,
        durationMs: 5_000,
        aiCardData: {
          sourceCardId: 'ai-card-pip',
          cardType: 'summary',
          title: '总结卡',
          content: '重点内容',
          template: 'summary-default',
          displayMode: 'pip',
          style: {
            primaryColor: '#6366f1',
            backgroundColor: '#0f172a',
            fontSize: 48,
          },
        },
      },
    ]);

    expect(useTimelineStore.getState().timeline.overlays[0]).toMatchObject({
      overlayType: 'ai-card',
      position: {
        x: 1224,
        y: 670,
        width: 653,
        height: 367,
      },
    });
  });

  it('reflows an existing ai card overlay when display mode changes to pip', () => {
    const store = useTimelineStore.getState();

    store.addAICardsToTimeline([
      {
        sourceCardId: 'ai-card-1',
        startMs: 2_000,
        durationMs: 5_000,
        aiCardData: {
          sourceCardId: 'ai-card-1',
          cardType: 'summary',
          title: '总结卡',
          content: '重点内容',
          template: 'summary-default',
          displayMode: 'fullscreen',
          style: {
            primaryColor: '#6366f1',
            backgroundColor: '#0f172a',
            fontSize: 48,
          },
        },
      },
    ]);
    store.addAICardsToTimeline([
      {
        sourceCardId: 'ai-card-1',
        startMs: 8_000,
        durationMs: 5_000,
        aiCardData: {
          sourceCardId: 'ai-card-1',
          cardType: 'summary',
          title: '总结卡',
          content: '重点内容',
          template: 'summary-default',
          displayMode: 'pip',
          style: {
            primaryColor: '#6366f1',
            backgroundColor: '#0f172a',
            fontSize: 48,
          },
        },
      },
    ]);

    expect(useTimelineStore.getState().timeline.overlays).toHaveLength(1);
    expect(useTimelineStore.getState().timeline.overlays[0]).toMatchObject({
      startMs: 8_000,
      durationMs: 5_000,
      position: {
        x: 1224,
        y: 670,
        width: 653,
        height: 367,
      },
    });
  });

  it('stores the selected cover as a full-duration default background', () => {
    const store = useTimelineStore.getState();
    store.setPodcast('/tmp/audio.mp3', '/tmp/subtitles.srt', 12_000);

    store.setGlobalBackground('/tmp/cover.png');

    expect(useTimelineStore.getState().timeline.overlays[0]).toMatchObject({
      type: 'image',
      assetPath: '/tmp/cover.png',
      trackId: DEFAULT_VISUAL_TRACK_ID,
      startMs: 0,
      durationMs: 12_000,
      overlayRole: 'default-background',
      position: { x: 0, y: 0, width: 1920, height: 1080 },
    });
    expect(useTimelineStore.getState().assets.map((asset) => asset.path)).toContain('/tmp/cover.png');
  });

  it('reuses the existing default background overlay when changing covers', () => {
    const store = useTimelineStore.getState();
    store.setPodcast('/tmp/audio.mp3', '/tmp/subtitles.srt', 12_000);

    store.setGlobalBackground('/tmp/cover-a.png');
    const initialOverlayId = useTimelineStore.getState().timeline.overlays[0]?.id;

    store.setGlobalBackground('/tmp/cover-b.png');

    expect(useTimelineStore.getState().timeline.overlays).toHaveLength(1);
    expect(useTimelineStore.getState().timeline.overlays[0]).toMatchObject({
      id: initialOverlayId,
      assetPath: '/tmp/cover-b.png',
      durationMs: 12_000,
      overlayRole: 'default-background',
    });
  });

  it('adds a text overlay to the timeline', () => {
    const store = useTimelineStore.getState();
    const overlayId = store.addOverlay({
      type: 'text',
      assetPath: '',
      trackId: DEFAULT_VISUAL_TRACK_ID,
      startMs: 1000,
      durationMs: 5000,
      position: { x: 100, y: 200, width: 800, height: 200 },
      textData: {
        content: '测试',
        fontFamily: 'PingFang SC',
        fontSize: 64,
        fontColor: '#FFFFFF',
        bold: false,
        italic: false,
        underline: false,
        textAlign: 'center',
        backgroundColor: 'transparent',
        strokeColor: '#000000',
        strokeWidth: 0,
        shadowColor: '#000000',
        shadowOffsetX: 0,
        shadowOffsetY: 2,
        shadowBlur: 0,
        letterSpacing: 0,
        lineHeight: 1.5,
        opacity: 1,
        rotation: 0,
        animation: {
          enter: 'fadeIn',
          enterDurationMs: 500,
          exit: 'fadeOut',
          exitDurationMs: 500,
          loop: 'none',
        },
      },
    });

    expect(overlayId).toBeTruthy();
    const overlay = useTimelineStore.getState().timeline.overlays.find((o) => o.id === overlayId);
    expect(overlay?.type).toBe('text');
    expect(overlay?.textData?.content).toBe('测试');
  });

  it('does not add text overlays to asset list', () => {
    const store = useTimelineStore.getState();
    store.addOverlay({
      type: 'text',
      assetPath: '',
      trackId: DEFAULT_VISUAL_TRACK_ID,
      startMs: 0,
      durationMs: 5000,
      position: { x: 0, y: 0, width: 800, height: 200 },
      textData: {
        content: '测试',
        fontFamily: 'PingFang SC',
        fontSize: 64,
        fontColor: '#FFFFFF',
        bold: false,
        italic: false,
        underline: false,
        textAlign: 'center',
        backgroundColor: 'transparent',
        strokeColor: '#000000',
        strokeWidth: 0,
        shadowColor: '#000000',
        shadowOffsetX: 0,
        shadowOffsetY: 2,
        shadowBlur: 0,
        letterSpacing: 0,
        lineHeight: 1.5,
        opacity: 1,
        rotation: 0,
        animation: {
          enter: 'none',
          enterDurationMs: 500,
          exit: 'none',
          exitDurationMs: 500,
          loop: 'none',
        },
      },
    });

    const assets = useTimelineStore.getState().assets;
    expect(assets.filter((a) => a.type === 'text')).toHaveLength(0);
  });

  it('keeps the default background stretched to the latest podcast duration', () => {
    const store = useTimelineStore.getState();
    store.setPodcast('/tmp/audio.mp3', '/tmp/subtitles.srt', 12_000);
    store.setGlobalBackground('/tmp/cover.png');

    store.setPodcast('/tmp/audio.mp3', '/tmp/subtitles.srt', 18_000);

    expect(useTimelineStore.getState().timeline.overlays[0]).toMatchObject({
      startMs: 0,
      durationMs: 18_000,
      overlayRole: 'default-background',
    });
  });
});
