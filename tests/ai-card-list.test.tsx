import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { AICardList } from '../src/components/AICardList';
import { useAIStore } from '../src/store/ai';
import type { AICard } from '../src/types/ai';

const baseCardStyle = {
  primaryColor: '#fff',
  backgroundColor: '#000',
  fontSize: 48,
} as const;

function makeImageCard(
  generationStatus: 'idle' | 'pending' | 'generating' | 'ready' | 'failed' | 'cancelled' = 'ready',
  overrides?: Partial<AICard>,
): AICard {
  return {
    id: 'img-1',
    segmentId: 's1',
    type: 'image',
    title: '图片卡',
    content: {
      mediaType: 'image',
      assetPath: 'ai-cards/img-1/image.png',
      aspectRatio: '16:9',
      prompt: '一只猫',
      providerId: 'p1',
      model: 'm1',
      generationStatus,
    },
    startMs: 0,
    endMs: 5_000,
    displayDurationMs: 5_000,
    displayMode: 'fullscreen',
    template: 'image-default',
    enabled: true,
    style: baseCardStyle,
    ...overrides,
  };
}

function makeVideoCard(
  generationStatus: 'idle' | 'pending' | 'generating' | 'ready' | 'failed' | 'cancelled' = 'ready',
  overrides?: Partial<AICard>,
): AICard {
  return {
    id: 'vid-1',
    segmentId: 's1',
    type: 'video',
    title: '视频卡',
    content: {
      mediaType: 'video',
      assetPath: 'ai-cards/vid-1/video.mp4',
      posterPath: 'ai-cards/vid-1/poster.jpg',
      aspectRatio: '16:9',
      prompt: '海岸线',
      providerId: 'v1',
      model: 'vidu-2',
      generationStatus,
    },
    startMs: 0,
    endMs: 6_000,
    displayDurationMs: 6_000,
    displayMode: 'fullscreen',
    template: 'video-default',
    enabled: true,
    style: baseCardStyle,
    ...overrides,
  };
}

describe('AICardList', () => {
  afterEach(() => {
    useAIStore.setState({ currentProjectDir: null });
  });

  it('renders design-aligned ai card rows for the left assistant panel', () => {
    const html = renderToStaticMarkup(
      <AICardList
        cards={[
          {
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
          },
        ]}
        placements={{
          'card-1': {
            trackId: 'visual-1',
            trackLabel: '轨道 1',
          },
        }}
        onToggleEnabled={() => undefined}
        onDeleteCard={() => undefined}
        onEditCard={() => undefined}
      />,
    );

    expect(html).toContain('data-ai-card-list="true"');
    expect(html).toContain('data-ai-card-type="summary"');
    expect(html).toContain('本期要点');
    expect(html).toContain('重点内容');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('摘要');
    expect(html).toContain('data-ai-card-copy="true"');
    expect(html).not.toContain('aria-label="删除 本期要点"');
  });

  it('keeps card copy constrained inside the outer container for long content', () => {
    const css = fs.readFileSync(
      new URL('../src/components/AICardList.module.css', import.meta.url),
      'utf-8',
    );

    expect(css).toMatch(/\.card\s*\{[\s\S]*width:\s*100%/);
    expect(css).toMatch(/\.card\s*\{[\s\S]*box-sizing:\s*border-box/);
    expect(css).toMatch(/\.title\s*\{[\s\S]*flex:\s*1/);
    expect(css).toMatch(/\.body\s*\{[\s\S]*min-width:\s*0/);
    expect(css).toMatch(/\.body\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
  });

  it('image 卡显示基于 assetPath 拼出的 file:// 缩略图', () => {
    useAIStore.setState({ currentProjectDir: '/tmp/proj' });
    const html = renderToStaticMarkup(
      <AICardList
        cards={[makeImageCard('ready')]}
        onToggleEnabled={() => undefined}
        onDeleteCard={() => undefined}
        onEditCard={() => undefined}
      />,
    );
    expect(html).toContain('data-ai-card-thumbnail="image"');
    expect(html).toContain('file:///tmp/proj/ai-cards/img-1/image.png');
  });

  it('video 卡显示基于 posterPath 拼出的 file:// 缩略图', () => {
    useAIStore.setState({ currentProjectDir: '/tmp/proj' });
    const html = renderToStaticMarkup(
      <AICardList
        cards={[makeVideoCard('ready')]}
        onToggleEnabled={() => undefined}
        onDeleteCard={() => undefined}
        onEditCard={() => undefined}
      />,
    );
    expect(html).toContain('data-ai-card-thumbnail="video"');
    expect(html).toContain('file:///tmp/proj/ai-cards/vid-1/poster.jpg');
  });

  it('generating 状态显示生成中徽章', () => {
    useAIStore.setState({ currentProjectDir: '/tmp/proj' });
    const html = renderToStaticMarkup(
      <AICardList
        cards={[
          makeImageCard('generating', {
            content: {
              mediaType: 'image',
              assetPath: null,
              aspectRatio: '16:9',
              prompt: '一只猫',
              providerId: 'p1',
              model: 'm1',
              generationStatus: 'generating',
            },
          }),
        ]}
        onToggleEnabled={() => undefined}
        onDeleteCard={() => undefined}
        onEditCard={() => undefined}
      />,
    );
    expect(html).toContain('data-ai-card-status="generating"');
  });

  it('failed 状态显示失败徽章', () => {
    useAIStore.setState({ currentProjectDir: '/tmp/proj' });
    const html = renderToStaticMarkup(
      <AICardList
        cards={[
          makeImageCard('failed', {
            content: {
              mediaType: 'image',
              assetPath: null,
              aspectRatio: '16:9',
              prompt: '一只猫',
              providerId: 'p1',
              model: 'm1',
              generationStatus: 'failed',
              errorMessage: '炸了',
            },
          }),
        ]}
        onToggleEnabled={() => undefined}
        onDeleteCard={() => undefined}
        onEditCard={() => undefined}
      />,
    );
    expect(html).toContain('data-ai-card-status="failed"');
  });
});
