import { Check, X } from 'lucide-react';
import type { Annotation } from '../../store/script';
import { Badge, Button } from '../../ui';
import styles from './ReviewStatusBar.module.css';

interface ReviewStatusBarProps {
  annotations: Annotation[];
  onAcceptAll: () => void;
  onDismissAll: () => void;
}

export function ReviewStatusBar({
  annotations,
  onAcceptAll,
  onDismissAll,
}: ReviewStatusBarProps) {
  const pending = annotations.filter((a) => a.status === 'pending').length;
  const accepted = annotations.filter((a) => a.status === 'accepted').length;
  const dismissed = annotations.filter((a) => a.status === 'dismissed').length;
  const total = annotations.length;

  if (total === 0) return null;

  const allResolved = pending === 0;

  return (
    <div className={styles.bar}>
      <div className={styles.stats}>
        {pending > 0 && (
          <Badge variant="warning" className={styles.badge}>
            {pending} 待处理
          </Badge>
        )}
        {accepted > 0 && (
          <Badge variant="success" className={styles.badge}>
            {accepted} 采纳
          </Badge>
        )}
        {dismissed > 0 && (
          <Badge variant="secondary" className={styles.badge}>
            {dismissed} 忽略
          </Badge>
        )}
        <span className={styles.sep}>/</span>
        <span className={styles.total}>{total} 条批注</span>
      </div>

      {!allResolved ? (
        <div className={styles.actions}>
          <Button
            variant="destructive"
            size="xs"
            leftIcon={<X size={10} strokeWidth={2} />}
            onClick={onDismissAll}
            title="忽略所有待处理批注"
          >
            全部忽略
          </Button>
          <Button
            variant="primary"
            size="xs"
            leftIcon={<Check size={10} strokeWidth={2.5} />}
            onClick={onAcceptAll}
            title="采纳所有待处理批注"
          >
            全部采纳
          </Button>
        </div>
      ) : (
        <span className={styles.resolvedHint}>已全部处理</span>
      )}
    </div>
  );
}
