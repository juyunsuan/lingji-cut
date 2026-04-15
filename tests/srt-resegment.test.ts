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

describe('splitLongEntry', () => {
  it('keeps short entry unchanged', () => {
    const entry = createEntry({ text: '短字幕', startMs: 0, endMs: 1_000 });
    const result = splitLongEntry(entry, 35);
    expect(result).toEqual([entry]);
  });

  it('splits at Chinese punctuation and distributes time by char ratio', () => {
    const entry = createEntry({
      text: '这是第一小段话，这是第二小段话哈哈',
      startMs: 0,
      endMs: 10_000,
    });
    const result = splitLongEntry(entry, 10);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('这是第一小段话，');
    expect(result[1].text).toBe('这是第二小段话哈哈');

    const totalLen = result[0].text.length + result[1].text.length;
    const expectedFrontDuration = Math.round((10_000 * result[0].text.length) / totalLen);
    expect(result[0].startMs).toBe(0);
    expect(result[0].endMs).toBe(expectedFrontDuration);
    expect(result[1].startMs).toBe(expectedFrontDuration);
    expect(result[1].endMs).toBe(10_000);
  });

  it('recursively splits when a segment is still too long', () => {
    // 24 chars, no punctuation → hard-cut recursion
    const entry = createEntry({
      text: '哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈',
      startMs: 0,
      endMs: 10_000,
    });
    const result = splitLongEntry(entry, 8);
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.every((e) => e.text.length <= 8)).toBe(true);
  });

  it('preserves last segment endMs and first segment startMs', () => {
    const entry = createEntry({
      text: '一二三四五六七八九十一二三四五六七八九十一',
      startMs: 1_000,
      endMs: 5_000,
    });
    const result = splitLongEntry(entry, 10);
    expect(result[0].startMs).toBe(1_000);
    expect(result[result.length - 1].endMs).toBe(5_000);
  });

  it('preserves the original entry index on all split segments', () => {
    const entry = createEntry({
      index: 7,
      text: '一二三四五六七八九十一二三四五六七八九十一',
      startMs: 0,
      endMs: 4_000,
    });
    const result = splitLongEntry(entry, 10);
    expect(result.every((e) => e.index === 7)).toBe(true);
  });
});
