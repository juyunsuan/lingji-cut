import { describe, expect, it } from 'vitest';
import { buildStoryboardSuggestions } from '../src/lib/storyboard-planner';

describe('storyboard planner', () => {
  it('creates data motion suggestion for high-score data segment', () => {
    const plan = buildStoryboardSuggestions([
      {
        id: 's1',
        startMs: 0,
        endMs: 4000,
        title: '增长数据',
        summary: '营收上涨',
        semanticType: 'data',
        complexityLevel: 'medium',
        visualizationScore: 90,
        pacingNeed: 'accent',
        keywords: ['增长'],
        entities: ['营收'],
      },
    ]);

    expect(plan.suggestions[0].suggestionType).toBe('data-motion');
  });
});
