import type { ReactNode } from 'react';
import styles from './ActionBar.module.css';

export interface ActionBarProps {
  start?: ReactNode;
  center?: ReactNode;
  end?: ReactNode;
}

export function ActionBar({ center, end, start }: ActionBarProps) {
  return (
    <div className={styles.root}>
      <div className={styles.start}>{start}</div>
      <div className={styles.center}>{center}</div>
      <div className={styles.end}>{end}</div>
    </div>
  );
}
