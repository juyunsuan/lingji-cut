import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'tint' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export function Button({
  children,
  className,
  disabled = false,
  fullWidth = false,
  leadingIcon,
  loading = false,
  size = 'md',
  trailingIcon,
  type = 'button',
  variant = 'secondary',
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      className={joinClassNames(
        styles.root,
        styles[`variant${capitalize(variant)}`],
        styles[`size${capitalize(size)}`],
        fullWidth ? styles.fullWidth : '',
        loading ? styles.loading : '',
        className,
      )}
      data-size={size}
      data-variant={variant}
      aria-busy={loading || undefined}
      disabled={isDisabled}
      {...props}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      {leadingIcon ? <span className={styles.iconWrap}>{leadingIcon}</span> : null}
      <span className={styles.content}>{children}</span>
      {trailingIcon ? <span className={styles.iconWrap}>{trailingIcon}</span> : null}
    </button>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ');
}
