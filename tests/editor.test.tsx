import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../src/hooks/useViewportSize', () => ({
  useViewportSize: () => ({ width: 1440, height: 900 }),
}));

vi.mock('../src/components/PreviewPanel', () => ({
  PreviewPanel: () => <div>preview-panel</div>,
}));

vi.mock('../src/components/Timeline', () => ({
  Timeline: () => <div>timeline-panel</div>,
}));

vi.mock('../src/components/AssetPanel', () => ({
  AssetPanel: (props: {
    onUseAsPodcastAudio?: () => Promise<void>;
    onUseAsPodcastSrt?: () => Promise<void>;
  }) => (
    <div
      data-asset-audio-hook={String(Boolean(props.onUseAsPodcastAudio))}
      data-asset-srt-hook={String(Boolean(props.onUseAsPodcastSrt))}
    >
      asset-panel
    </div>
  ),
}));

vi.mock('../src/components/AIPanel', () => ({
  AIPanel: () => <div>ai-panel</div>,
}));

vi.mock('../src/components/EditorInspector', () => ({
  EditorInspector: () => <div data-editor-region="inspector-shell">editor-inspector</div>,
}));

vi.mock('../src/components/ExportProgress', () => ({
  ExportProgress: () => null,
}));

vi.mock('../src/components/ExportSettingsModal', () => ({
  ExportSettingsModal: () => null,
}));

vi.mock('../src/hooks/useAIVideoWorkflow', () => ({
  useAIVideoWorkflow: () => ({
    start: () => undefined,
    cancel: () => undefined,
    retry: () => undefined,
    continueFromTtsDone: () => undefined,
    workflow: {
      step: 'idle',
      progress: 0,
      stepLabel: '',
      error: null,
      canCancel: false,
    },
  }),
}));

vi.mock('../src/components/TimelineAIOverlay', () => ({
  TimelineAIOverlay: (props: { compactTimeline?: boolean; onRetry?: () => void }) => (
    <div
      data-editor-region="timeline-ai-overlay"
      data-compact-timeline={String(Boolean(props.compactTimeline))}
      data-has-retry={String(Boolean(props.onRetry))}
    >
      timeline-ai-overlay
    </div>
  ),
}));

vi.mock('../src/store/timeline', () => ({
  useTimelineStore: () => ({
    timeline: {
      fps: 30,
      width: 1920,
      height: 1080,
      podcast: {
        durationMs: 60_000,
      },
    },
  }),
}));

async function renderEditor() {
  const { Editor } = await import('../src/pages/Editor');

  return renderToStaticMarkup(
    <Editor
      onAddAsset={async () => undefined}
      onUseAsPodcastAudio={async () => undefined}
      onUseAsPodcastSrt={async () => undefined}
      exportRequestToken={0}
    />,
  );
}

describe('Editor', () => {
  it('renders a three-pane workspace with left tabs and a right inspector shell on wide screens', async () => {
    const html = await renderEditor();

    expect(html).toContain('data-editor-sidebar-style="flat-panel"');
    expect(html).toContain('data-editor-sidebar-width="224"');
    expect(html).toContain('素材');
    expect(html).toContain('AI 助手');
    expect(html).toContain('data-editor-region="inspector-shell"');
    expect(html).toContain('224px minmax(0, 1fr) 260px');
  });

  it('clips the timeline row so the lower panel shadow cannot overlap the sidebar footer', async () => {
    const html = await renderEditor();

    expect(html).toContain('data-editor-region="timeline-wrap"');
    expect(html).toContain('data-editor-region="sidebar-shell"');
  });

  it('passes dedicated audio and srt attach handlers into the asset panel', async () => {
    const html = await renderEditor();

    expect(html).toContain('data-asset-audio-hook="true"');
    expect(html).toContain('data-asset-srt-hook="true"');
  });

  it('renders AI one-click clip button when project dir is available', async () => {
    const rendered = await (async () => {
      const { Editor } = await import('../src/pages/Editor');
      return renderToStaticMarkup(
        <Editor
          onAddAsset={async () => undefined}
          onUseAsPodcastAudio={async () => undefined}
          onUseAsPodcastSrt={async () => undefined}
          exportRequestToken={0}
          projectDir="/tmp/project"
        />,
      );
    })();

    expect(rendered).toContain('AI 一键剪辑');
  });

  it('passes retry support and timeline compact flag into the AI overlay', async () => {
    const html = await renderEditor();

    expect(html).toContain('data-editor-region="timeline-ai-overlay"');
    expect(html).toContain('data-has-retry="true"');
  });
});
