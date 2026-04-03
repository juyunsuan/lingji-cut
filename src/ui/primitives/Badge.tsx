import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';
export type BadgeShape = 'pill' | 'rounded';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  shape?: BadgeShape;
  children: ReactNode;
}

export function Badge({
  children,
  className,
  shape = 'pill',
  variant = 'neutral',
  ...props
}: BadgeProps) {
  return (
    <span
      className={joinClassNames(
        styles.root,
        styles[`variant${capitalize(variant)}`],
        styles[`shape${capitalize(shape)}`],
        className,
      )}
      data-shape={shape}
      data-variant={variant}
      {...props}
    >
      {children}
    </span>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ');
}
