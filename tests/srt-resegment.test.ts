import { describe, expect, it } from 'vitest';
import type { SrtEntry } from '../src/types';
import {
  DEFAULT_MAX_CHARS_PER_ENTRY,
  MIN_SEGMENT_DURATION_MS,
  findBestBreakPoint,
  resegmentSrtEntries,
  splitLongEntry,
} from '../src/lib/srt-resegment';

function createEntry(overrides: Partial<SrtEntry> = {}): SrtEntry {
  return {
    index: 1,
    startMs: 0,
    endMs: 4_000,
    text: '默认文本',
    ...overrides,
  };
}

describe('srt-resegment constants', () => {
  it('exports default max chars', () => {
    expect(DEFAULT_MAX_CHARS_PER_ENTRY).toBe(35);
  });

  it('exports min segment duration', () => {
    expect(MIN_SEGMENT_DURATION_MS).toBe(300);
  });
});
