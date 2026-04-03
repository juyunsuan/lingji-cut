import type { TextareaHTMLAttributes } from 'react';
import styles from './Textarea.module.css';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  fullWidth?: boolean;
}

export function Textarea({ className, fullWidth = true, ...props }: TextareaProps) {
  return (
    <textarea
      className={joinClassNames(styles.root, fullWidth ? styles.fullWidth : '', className)}
      {...props}
    />
  );
}

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ');
}
