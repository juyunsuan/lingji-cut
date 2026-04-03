import type { InputHTMLAttributes } from 'react';
import styles from './SearchField.module.css';

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  icon?: string;
}

export function SearchField({ className, icon = '⌕', ...props }: SearchFieldProps) {
  return (
    <label className={`${styles.root}${className ? ` ${className}` : ''}`}>
      <span className={styles.icon}>{icon}</span>
      <input type="search" className={styles.input} {...props} />
    </label>
  );
}
