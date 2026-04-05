import type { ReactNode } from 'react';
import { Button } from '../components/button';
import styles from './PillGroup.module.css';

type ButtonSize = 'sm' | 'md' | 'lg';

export interface PillGroupItem<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

interface PillGroupProps<T extends string> {
  items: Array<PillGroupItem<T>>;
  value: T;
  onChange: (value: T) => void;
  size?: ButtonSize;
  fullWidth?: boolean;
  wrap?: boolean;
}

export function PillGroup<T extends string>({
  fullWidth = false,
  items,
  onChange,
  size = 'sm',
  value,
  wrap = true,
}: PillGroupProps<T>) {
  return (
    <div
      className={joinClassNames(
        styles.root,
        wrap ? styles.wrap : styles.noWrap,
        fullWidth ? styles.fullWidth : '',
      )}
    >
      {items.map((item) => {
        const isActive = item.value === value;

        return (
          <Button
            key={item.value}
            onClick={() => onChange(item.value)}
            variant={isActive ? 'primary' : 'secondary'}
            size={size === 'md' ? 'default' : size}
            className={styles.item}
            aria-pressed={isActive}
            disabled={item.disabled}
          >
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ');
}
