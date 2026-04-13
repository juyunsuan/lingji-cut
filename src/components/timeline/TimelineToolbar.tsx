import type { MouseEvent } from 'react';
import { useTimelineStore, type TimelineStore } from '../../store/timeline';
import { ZoomControls } from './ZoomControls';
import styles from './TimelineToolbar.module.css';

export interface TimelineToolbarProps {
  zoomLevel: number;
  onZoomChange: (zoom: number) => void;
  timelineDurationMs: number;
  viewportWidth: number;
  snapEnabled: boolean;
  onToggleSnap: () => void;
  onAddTrack: () => void;
  onSplit: () => void;
}

export function TimelineToolbar({
  zoomLevel,
  onZoomChange,
  timelineDurationMs,
  viewportWidth,
  snapEnabled,
  onToggleSnap,
  onAddTrack,
  onSplit,
}: TimelineToolbarProps) {
  const canUndo = useTimelineStore((s: TimelineStore) => s.canUndo);
  const canRedo = useTimelineStore((s: TimelineStore) => s.canRedo);
  const undo = useTimelineStore((s: TimelineStore) => s.undo);
  const redo = useTimelineStore((s: TimelineStore) => s.redo);

  const handle = (fn: () => void) => (e: MouseEvent) => {
    e.preventDefault();
    fn();
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.group}>
        <button
          type="button"
          className={styles.btn}
          title="撤销 ⌘Z"
          aria-label="撤销"
          disabled={!canUndo}
          onClick={handle(undo)}
        >
          ↶
        </button>
        <button
          type="button"
          className={styles.btn}
          title="重做 ⌘⇧Z"
          aria-label="重做"
          disabled={!canRedo}
          onClick={handle(redo)}
        >
          ↷
        </button>
        <button
          type="button"
          className={styles.btn}
          title="添加轨道"
          aria-label="添加轨道"
          onClick={handle(onAddTrack)}
        >
          ＋
        </button>
        <button
          type="button"
          className={styles.btn}
          title="分割 S"
          aria-label="分割"
          onClick={handle(onSplit)}
        >
          ✂
        </button>
      </div>
      <div className={styles.spacer} />
      <div className={styles.group}>
        <button
          type="button"
          className={`${styles.btn}${snapEnabled ? ` ${styles.btnActive}` : ''}`}
          title="磁性对齐"
          aria-label="磁性对齐"
          aria-pressed={snapEnabled}
          onClick={handle(onToggleSnap)}
        >
          🧲
        </button>
        <ZoomControls
          zoomLevel={zoomLevel}
          onZoomChange={onZoomChange}
          timelineDurationMs={timelineDurationMs}
          viewportWidth={viewportWidth}
        />
      </div>
    </div>
  );
}
