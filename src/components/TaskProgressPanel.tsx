import { useTaskProgressStore } from '../store/task-progress';
import type { TaskCategory, TaskProgressItem } from '../store/task-progress';
import { Progress } from '../ui';
import styles from './TaskProgressPanel.module.css';

const CATEGORY_ICONS: Record<TaskCategory, string> = {
  'ai-write': '🤖',
  'ai-review': '🔍',
  'ai-analyze': '🧠',
  'import': '📥',
  'export': '🎬',
  'tts': '🎙️',
  'cover': '🖼️',
  'io': '📁',
};

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

function TaskRow({ task }: { task: TaskProgressItem }) {
  const removeTask = useTaskProgressStore((s) => s.removeTask);
  const icon = CATEGORY_ICONS[task.category] ?? '📁';
  const color = CATEGORY_COLORS[task.category] ?? '#9ca3af';

  const barColor =
    task.status === 'completed'
      ? 'var(--color-success, #32D74B)'
      : task.status === 'error'
        ? 'var(--color-danger, #FF453A)'
        : color;

  const barWidth = task.status === 'completed' ? 100 : task.progress;

  return (
    <div className={styles.taskRow}>
      <span className={styles.taskIcon}>{
        task.status === 'completed' ? '✅' : task.status === 'error' ? '❌' : icon
      }</span>
      <span className={styles.taskLabel}>{task.label}{task.status === 'completed' ? ' 完成' : ''}</span>

      {task.status === 'error' && task.error && (
        <span className={styles.errorText} title={task.error}>{task.error}</span>
      )}
      {task.status === 'active' && task.phase && (
        <span className={styles.taskPhase}>{task.phase}</span>
      )}

      <Progress
        value={barWidth}
        size="sm"
        variant={
          task.status === 'completed' ? 'success'
            : task.status === 'error' ? 'danger'
            : 'default'
        }
        indeterminate={task.status === 'active' && task.mode !== 'determinate'}
        className={styles.taskBar}
      />

      {task.status === 'active' && task.mode === 'determinate' && (
        <span className={styles.taskPct}>{task.progress}%</span>
      )}
      {task.status !== 'active' && <span className={styles.taskPct} />}

      {task.status === 'active' && task.canCancel && task.onCancel && (
        <button className={styles.cancelBtn} onClick={task.onCancel} title="取消">⏹</button>
      )}
      {task.status === 'completed' && task.completionAction && (
        <button className={styles.actionBtn} onClick={task.completionAction.handler}>
          {task.completionAction.label}
        </button>
      )}
      {task.status === 'error' && (
        <button className={styles.actionBtn} onClick={() => removeTask(task.id)}>关闭</button>
      )}
    </div>
  );
}

function CardChildRow({ task }: { task: TaskProgressItem }) {
  const dot =
    task.status === 'completed' ? '✓'
      : task.status === 'error' ? '✗'
      : '◉';
  const dotClass =
    task.status === 'completed' ? styles.childDotDone
      : task.status === 'error' ? styles.childDotError
      : styles.childDotActive;
  return (
    <div className={styles.childRow}>
      <span className={`${styles.childDot} ${dotClass}`}>{dot}</span>
      <span className={styles.childLabel}>{task.label}</span>
      {task.status === 'active' && task.phase && (
        <span className={styles.taskPhase}>{task.phase}</span>
      )}
      {task.status === 'error' && task.error && (
        <span className={styles.errorText} title={task.error}>{task.error}</span>
      )}
    </div>
  );
}

export function TaskProgressPanel() {
  const panelOpen = useTaskProgressStore((s) => s.panelOpen);
  const setPanelOpen = useTaskProgressStore((s) => s.setPanelOpen);
  const tasks = useTaskProgressStore((s) => s.tasks);

  if (!panelOpen || tasks.size === 0) return null;

  const all = Array.from(tasks.values());
  const topLevel = all
    .filter((t) => !t.parentId)
    .sort((a, b) => b.startedAt - a.startedAt);
  const childrenOf = (parentId: string) =>
    all
      .filter((t) => t.parentId === parentId)
      .sort((a, b) => a.startedAt - b.startedAt);

  return (
    <>
      <div className={styles.overlay} onClick={() => setPanelOpen(false)} />
      <div className={styles.panel}>
        {topLevel.map((task) => (
          <div key={task.id}>
            <TaskRow task={task} />
            {childrenOf(task.id).map((child) => (
              <CardChildRow key={child.id} task={child} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
