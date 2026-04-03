import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './ModalShell.module.css';

export interface ModalShellProps {
  visible: boolean;
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  zIndex?: number;
}

export function ModalShell({
  children,
  description,
  eyebrow,
  footer,
  size = 'md',
  title,
  visible,
  zIndex,
}: ModalShellProps) {
  if (!visible) {
    return null;
  }

  const modalContent = (
    <div className={styles.overlay} style={overlayStyle(zIndex)}>
      <div className={`${styles.dialog} ${styles[`size${capitalize(size)}`]}`} role="dialog" aria-modal="true">
        {eyebrow || title || description ? (
          <div className={styles.header}>
            {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
            {title ? <h3 className={styles.title}>{title}</h3> : null}
            {description ? <p className={styles.description}>{description}</p> : null}
          </div>
        ) : null}
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  );

  if (typeof document === 'undefined' || !document.body) {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
}

function overlayStyle(zIndex?: number): CSSProperties | undefined {
  return zIndex ? { zIndex } : undefined;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
