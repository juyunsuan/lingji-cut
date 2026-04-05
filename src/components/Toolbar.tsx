import { Download } from 'lucide-react';
import type { MenuAction } from '../lib/electron-api';
import type { SaveStatus } from '../store/timeline';
import { Button } from '../ui';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  compact: boolean;
  page: 'setup' | 'editor';
  projectName: string;
  saveStatus: SaveStatus;
  onCommand: (command: MenuAction) => void;
}

const saveStatusLabelMap: Record<SaveStatus, string> = {
  idle: '未打开工程',
  saving: '保存中…',
  saved: '已保存',
  error: '保存失败',
};

export function Toolbar({
  compact,
  page,
  projectName,
  saveStatus,
  onCommand,
}: ToolbarProps) {
  const saveStatusLabel = saveStatusLabelMap[saveStatus];
  const visibleProjectName = projectName || (page === 'editor' ? '未命名工程' : '欢迎页');

  return (
    <header
      className={[styles.root, compact ? styles.compact : ''].filter(Boolean).join(' ')}
    >
      {/* macOS hiddenInset 模式下系统会在此区域渲染原生红绿灯，留出占位 */}
      <div className={styles.trafficLightSpacer} aria-hidden="true" />

      {/* 居中标题（absolute 定位，不参与 flex 流） */}
      <div className={styles.titleArea}>
        <span className={styles.projectName}>{visibleProjectName}</span>
        <span className={styles.saveStatus}>{saveStatusLabel}</span>
      </div>

      {/* 右侧操作区 */}
      <div className={styles.actions}>
        <Button
          variant="primary"
          size="sm"
          disabled={page !== 'editor'}
          onClick={() => onCommand('export')}
          leftIcon={<Download size={14} />}
        >
          导出
        </Button>
      </div>
    </header>
  );
}
