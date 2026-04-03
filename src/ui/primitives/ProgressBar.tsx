import styles from './ProgressBar.module.css';

export type ProgressTone = 'brand' | 'info' | 'danger';

export interface ProgressBarProps {
  value: number;
  tone?: ProgressTone;
}

export function ProgressBar({ tone = 'brand', value }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div
      className={styles.track}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      data-tone={tone}
    >
      <div
        className={`${styles.fill} ${styles[`tone${capitalize(tone)}`]}`}
        style={{ width: `${Math.max(2, clamped)}%` }}
      />
    </div>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
