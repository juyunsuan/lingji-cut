import { describe, expect, it } from 'vitest';
import { SCRIPT_TEMPLATE_SEEDS } from '../src/lib/prompts/script-template-defaults';

describe('SCRIPT_TEMPLATE_SEEDS ttsStyle', () => {
  it('三个内置 seed 都带非空 ttsStyle', () => {
    expect(SCRIPT_TEMPLATE_SEEDS).toHaveLength(3);
    for (const seed of SCRIPT_TEMPLATE_SEEDS) {
      expect(typeof seed.ttsStyle).toBe('string');
      expect((seed.ttsStyle ?? '').trim().length).toBeGreaterThan(10);
    }
  });
});
