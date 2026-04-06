import type { MenuAction } from '../lib/electron-api';
import type { SaveStatus } from '../store/timeline';
import { AppIcon } from './AppIcon';
import { Button } from '../ui';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  compact: boolean;
  page: 'setup' | 'editor';
  projectName: string;
  saveStatus: SaveStatus;
  canUndo: boolean;
  canRedo: boolean;
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
  canUndo,
  canRedo,
  onCommand,
}: ToolbarProps) {
  const saveStatusLabel = saveStatusLabelMap[saveStatus];
  const visibleProjectName = projectName || (page === 'editor' ? '未命名工程' : '欢迎页');
  const isEditorPage = page === 'editor';

  return (
    <header
      className={[styles.root, compact ? styles.compact : ''].filter(Boolean).join(' ')}
    >
      <div className={styles.leadingCluster}>
        {/* macOS hiddenInset 模式下系统会在此区域渲染原生红绿灯，留出占位 */}
        <div className={styles.trafficLightSpacer} aria-hidden="true" />

        <div className={styles.historyActions} data-toolbar-history="true">
          <Button.Icon
            variant="ghost"
            aria-label="撤销"
            title="撤销"
            className={styles.historyButton}
            data-command="undo"
            data-enabled={isEditorPage && canUndo ? 'true' : 'false'}
            disabled={!isEditorPage || !canUndo}
            onClick={() => onCommand('undo')}
          >
            <AppIcon name="undo-2" size={14} />
          </Button.Icon>
          <Button.Icon
            variant="ghost"
            aria-label="重做"
            title="重做"
            className={styles.historyButton}
            data-command="redo"
            data-enabled={isEditorPage && canRedo ? 'true' : 'false'}
            disabled={!isEditorPage || !canRedo}
            onClick={() => onCommand('redo')}
          >
            <AppIcon name="redo-2" size={14} />
          </Button.Icon>
        </div>
      </div>

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
          aria-label="导出"
          disabled={!isEditorPage}
          onClick={() => onCommand('export')}
          leftIcon={<AppIcon name="upload" size={14} />}
        >
          导出
        </Button>
      </div>
    </header>
  );
}
