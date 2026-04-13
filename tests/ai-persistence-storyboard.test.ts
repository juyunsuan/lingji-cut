import { describe, expect, it } from 'vitest';
import { createPersistedAIState } from '../src/lib/ai-persistence';

describe('ai persistence storyboard', () => {
  it('stores storyboard plan when provided', () => {
    const state = createPersistedAIState(
      null,
      [],
      [],
      {
        segments: [],
        suggestions: [],
        summary: '',
        generatedAt: 1,
      },
    );

    expect(state.storyboardPlan?.generatedAt).toBe(1);
  });
});
