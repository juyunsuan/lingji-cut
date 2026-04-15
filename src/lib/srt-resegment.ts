import type { SrtEntry } from '../types';

export const DEFAULT_MAX_CHARS_PER_ENTRY = 35;
export const MIN_CHARS_PER_ENTRY = 20;
export const MAX_CHARS_PER_ENTRY_LIMIT = 60;
export const MIN_SEGMENT_DURATION_MS = 300;

/**
 * 在 text 中为 targetLen 附近找最佳断点。
 * 返回切分位置 cut（前段为 text.slice(0, cut)，后段为 text.slice(cut)）。
 * 优先级：中文标点 > 英文标点 > 空格 > 硬切 targetLen。
 * 在同一优先级内选最靠右的位置（靠近 targetLen）。
 */
export function findBestBreakPoint(text: string, targetLen: number): number {
  throw new Error('not implemented');
}

/**
 * 把一个超长 entry 切成若干不超过 maxChars 的子 entry，递归切分。
 * 时间按字符数等比分配。
 */
export function splitLongEntry(entry: SrtEntry, maxChars: number): SrtEntry[] {
  throw new Error('not implemented');
}

/**
 * 遍历 entries，对每条超长的调用 splitLongEntry，最后重新编号 index 为 1..N。
 */
export function resegmentSrtEntries(entries: SrtEntry[], maxChars: number): SrtEntry[] {
  throw new Error('not implemented');
}
