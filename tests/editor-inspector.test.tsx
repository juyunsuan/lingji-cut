import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EditorInspector } from '../src/components/EditorInspector';

vi.mock('../src/hooks/useAICardInspector', () => ({
  useAICardInspector: () => ({
    card: {
      id: 'card-2',
      type: 'summary' as const,
      title: 'AI 驱动的未来',
      content: '人工智能正在改变创作方式。',
      startMs: 10_000,
      endMs: 55_000,
      displayDurationMs: 5_000,
      displayMode: 'fullscreen' as const,
      template: 'summary-default',
      enabled: true,
      style: {
        primaryColor: '#6366f1',
        backgroundColor: '#0f172a',
        fontSize: 48,
      },
    },
    cardSequenceLabel: '第 2 段',
    errorMessage: null,
    isPlacedOnTimeline: true,
    isRegeneratingCard: false,
    regenerateCard: async () => null,
    saveCard: () => undefined,
    deleteCard: () => undefined,
  }),
}));

describe('EditorInspector', () => {
  it('renders the design-aligned ai card header metadata', () => {
    const html = renderToStaticMarkup(
      <EditorInspector
        selection={{ type: 'ai-card', cardId: 'card-2' }}
        timelineWidth={1920}
        timelineHeight={1080}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain('AI CARD');
    expect(html).toContain('第 2 段');
    expect(html).not.toContain('仅素材');
    expect(html).not.toContain('已上轨');
  });
});
