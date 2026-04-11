import { useTaskProgressStore } from '../store/task-progress';
import type { TaskCategory } from '../store/task-progress';
import styles from './AppStatusBar.module.css';

const CATEGORY_COLORS: Record<TaskCategory, string> = {
  'ai-write': '#a78bfa',
  'ai-review': '#34d399',
  'ai-analyze': '#60a5fa',
  'import': '#fbbf24',
  'export': '#0A84FF',
  'tts': '#f472b6',
  'cover': '#c084fc',
  'io': '#9ca3af',
};

export function StatusBarProgressLine() {
  const primaryTask = useTaskProgressStore((s) => s.primaryTask);

  if (!primaryTask || primaryTask.status !== 'active') return null;

  const color = CATEGORY_COLORS[primaryTask.category] ?? '#9ca3af';
  const isDeterminate = primaryTask.mode === 'determinate';

  return (
    <div className={styles.progressLine}>
      <div
        className={styles.progressFillLine}
        data-mode={primaryTask.mode}
        style={{
          width: isDeterminate ? `${primaryTask.progress}%` : undefined,
          background: primaryTask.mode === 'streaming'
            ? `linear-gradient(90deg, transparent, ${color}, transparent)`
            : color,
        }}
      />
    </div>
  );
}
