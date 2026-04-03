import type { InputHTMLAttributes } from 'react';
import styles from './Input.module.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  fullWidth?: boolean;
}

export function Input({ className, fullWidth = true, ...props }: InputProps) {
  return (
    <input
      className={joinClassNames(styles.root, fullWidth ? styles.fullWidth : '', className)}
      {...props}
    />
  );
}

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ');
}
