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

describe('findBestBreakPoint', () => {
  it('prefers Chinese punctuation within window (rightmost)', () => {
    const text = '这是一段话，然后继续说更多';
    expect(findBestBreakPoint(text, 8)).toBe(6);
  });

  it('falls back to latin punctuation when no CJK punctuation in window', () => {
    // comma at i=5 is within scan range [windowStart-1=5, windowEnd-1=9], returns i+1=6
    const text = 'hello, world then more words here';
    expect(findBestBreakPoint(text, 10)).toBe(6);
  });

  it('hard-cuts when window has no punctuation or space', () => {
    const text = '这是一段没有任何标点的长文本哈哈哈哈';
    expect(findBestBreakPoint(text, 8)).toBe(8);
  });

  it('returns text.length when text is shorter than targetLen', () => {
    const text = '短文';
    expect(findBestBreakPoint(text, 10)).toBe(2);
  });

  it('picks rightmost punctuation within scan window', () => {
    // commas at i=2 and i=5; window scan [5,9], i=5 (，) is included → returns 6
    const text = '第一，第二，第三句话结束';
    expect(findBestBreakPoint(text, 10)).toBe(6);
  });
});
