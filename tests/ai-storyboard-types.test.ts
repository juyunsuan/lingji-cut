import { describe, expect, it } from 'vitest';
import { buildDefaultStoryboardPlan } from '../src/types/ai';

describe('storyboard types', () => {
  it('builds an empty storyboard plan', () => {
    expect(buildDefaultStoryboardPlan().suggestions).toEqual([]);
  });
});
