import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { AICardList } from '../src/components/AICardList';

describe('AICardList', () => {
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
});
