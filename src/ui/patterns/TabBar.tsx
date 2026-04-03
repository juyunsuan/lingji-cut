import type { ReactNode } from 'react';
import styles from './TabBar.module.css';

export interface TabBarItem<T extends string> {
  value: T;
  label: ReactNode;
}

interface TabBarProps<T extends string> {
  items: Array<TabBarItem<T>>;
  value: T;
  onChange: (value: T) => void;
}

export function TabBar<T extends string>({ items, onChange, value }: TabBarProps<T>) {
  return (
    <div className={styles.root}>
      {items.map((item) => {
        const isActive = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={styles.tab}
            data-active={isActive}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
