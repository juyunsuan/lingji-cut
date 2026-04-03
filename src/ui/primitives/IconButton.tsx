import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './IconButton.module.css';

export type IconButtonVariant = 'ghost' | 'subtle' | 'brand' | 'danger';
export type IconButtonSize = 'sm' | 'md';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  loading?: boolean;
  children: ReactNode;
}

export function IconButton({
  children,
  className,
  disabled = false,
  loading = false,
  size = 'md',
  type = 'button',
  variant = 'subtle',
  ...props
}: IconButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      className={joinClassNames(
        styles.root,
        styles[`variant${capitalize(variant)}`],
        styles[`size${capitalize(size)}`],
        className,
      )}
      data-size={size}
      data-variant={variant}
      aria-busy={loading || undefined}
      disabled={isDisabled}
      {...props}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : children}
    </button>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ');
}
