import { useMemo } from 'react';
import type { SrtEntry } from '../types';
import { clamp } from '../lib/utils';
import styles from './TimelineSubtitleBlocks.module.css';

interface TimelineSubtitleBlocksProps {
  entries: SrtEntry[];
  durationMs: number;
  pxPerMs: number;
  trackHeight: number;
  highlightHint?: string;
  onClickBlock?: () => void;
}

interface SubtitleBlockLayout {
  id: string;
  left: number;
  width: number;
  text: string;
}

function buildSubtitleLayouts(
  entries: SrtEntry[],
  durationMs: number,
  pxPerMs: number,
): SubtitleBlockLayout[] {
  return entries
    .map((entry) => {
      const startMs = clamp(entry.startMs, 0, durationMs);
      const endMs = clamp(entry.endMs, startMs, durationMs);
      const width = Math.max(2, Math.round((endMs - startMs) * pxPerMs));
      const text = entry.text.replace(/\s+/g, ' ').trim();

      return {
        id: `subtitle-${entry.index}`,
        left: Math.round(startMs * pxPerMs),
        width,
        text,
      };
    })
    .filter((entry) => entry.text.length > 0 && entry.width > 0);
}

export function TimelineSubtitleBlocks({
  entries,
  durationMs,
  pxPerMs,
  trackHeight,
  highlightHint,
  onClickBlock,
}: TimelineSubtitleBlocksProps) {
  const layouts = useMemo(
    () => buildSubtitleLayouts(entries, durationMs, pxPerMs),
    [durationMs, entries, pxPerMs],
  );

  return (
    <div className={styles.root}>
      {highlightHint ? <div className={styles.hint}>{highlightHint}</div> : null}
      {layouts.map((entry) => (
        <span
          key={entry.id}
          data-subtitle-entry={entry.id}
          className={styles.block}
          role="button"
          tabIndex={0}
          onClick={onClickBlock}
          style={{
            left: entry.left,
            top: Math.max(4, Math.round((trackHeight - 22) / 2)),
            width: entry.width,
            cursor: onClickBlock ? 'pointer' : undefined,
          }}
        >
          <span
            className={styles.text}
            style={{ padding: entry.width >= 24 ? '0 8px' : '0 4px' }}
          >
            {entry.text}
          </span>
        </span>
      ))}
    </div>
  );
}
