import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AICardOverlay } from '../src/remotion/AICardOverlay';
import type { OverlayItem } from '../src/types';

vi.mock('remotion', () => ({
  Sequence: ({ children }: { children: unknown }) => children,
}));

describe('AICardOverlay', () => {
  it('renders the summary card template for ai-card overlays', () => {
    const overlay: OverlayItem = {
      id: 'ai-overlay-1',
      type: 'image',
      assetPath: '',
      trackId: 'visual-1',
      startMs: 0,
      durationMs: 5_000,
      position: { x: 0, y: 0, width: 1_920, height: 1_080 },
      overlayType: 'ai-card',
      aiCardData: {
        cardType: 'summary',
        title: '本期要点',
        content: '要点一',
        template: 'summary-default',
        displayMode: 'fullscreen',
        style: {
          primaryColor: '#6366f1',
          backgroundColor: '#0f172a',
          fontSize: 48,
        },
      },
    };

    const html = renderToStaticMarkup(<AICardOverlay overlay={overlay} fps={30} />);

    expect(html).toContain('SUMMARY');
    expect(html).toContain('本期要点');
    expect(html).toContain('要点一');
  });

  it('renders web-card overlays with an iframe when srcDoc is available', () => {
    const overlay: OverlayItem = {
      id: 'ai-overlay-2',
      type: 'image',
      assetPath: '',
      trackId: 'visual-1',
      startMs: 0,
      durationMs: 5_000,
      position: { x: 0, y: 0, width: 1_920, height: 1_080 },
      overlayType: 'ai-card',
      aiCardData: {
        sourceCardId: 'card-2',
        cardType: 'quote',
        title: '网页卡片',
        content: '重点内容',
        template: 'web-card',
        displayMode: 'fullscreen',
        renderMode: 'web-card',
        webCard: {
          srcDoc: '<!doctype html><html><body><div id="card">Hello Web Card</div></body></html>',
        },
        style: {
          primaryColor: '#ec4899',
          backgroundColor: '#0f172a',
          fontSize: 48,
        },
      },
    };

    const html = renderToStaticMarkup(<AICardOverlay overlay={overlay} fps={30} />);

    expect(html).toContain('<iframe');
    expect(html).toContain('AI 网页卡片');
    expect(html).toContain('Hello Web Card');
  });

  it('forces iframe refresh when the generated html file is overwritten in place', () => {
    const overlay: OverlayItem = {
      id: 'ai-overlay-3',
      type: 'image',
      assetPath: '',
      trackId: 'visual-1',
      startMs: 0,
      durationMs: 5_000,
      position: { x: 0, y: 0, width: 1_920, height: 1_080 },
      overlayType: 'ai-card',
      aiCardData: {
        sourceCardId: 'card-3',
        cardType: 'summary',
        title: '网页卡片',
        content: '重点内容',
        template: 'web-card',
        displayMode: 'fullscreen',
        renderMode: 'web-card',
        webCard: {
          src: '/tmp/card-3.html',
          lastGeneratedAt: 1_234,
        },
        style: {
          primaryColor: '#6366f1',
          backgroundColor: '#0f172a',
          fontSize: 48,
        },
      },
    };

    const html = renderToStaticMarkup(<AICardOverlay overlay={overlay} fps={30} />);

    expect(html).toContain('file:///tmp/card-3.html?t=1234');
  });
});
