import { useTaskProgressStore } from '../store/task-progress';
import type { TaskCategory, TaskProgressItem } from '../store/task-progress';
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

      <div className={styles.taskBar}>
        <div
          className={styles.taskBarFill}
          style={{ width: `${barWidth}%`, background: barColor }}
        />
      </div>

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

export function TaskProgressPanel() {
  const panelOpen = useTaskProgressStore((s) => s.panelOpen);
  const setPanelOpen = useTaskProgressStore((s) => s.setPanelOpen);
  const tasks = useTaskProgressStore((s) => s.tasks);

  if (!panelOpen || tasks.size === 0) return null;

  const sorted = Array.from(tasks.values()).sort((a, b) => b.startedAt - a.startedAt);

  return (
    <>
      <div className={styles.overlay} onClick={() => setPanelOpen(false)} />
      <div className={styles.panel}>
        {sorted.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </div>
    </>
  );
}
