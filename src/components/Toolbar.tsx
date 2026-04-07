import { BotMessageSquare } from 'lucide-react';
import type { AppPage, MenuAction } from '../lib/electron-api';
import type { SaveStatus } from '../store/timeline';
import { useAgentStore } from '../store/agent';
import { AppIcon } from './AppIcon';
import { Button } from '../ui';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  compact: boolean;
  page: AppPage;
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

const pageTitleMap: Record<Exclude<AppPage, 'editor'>, string> = {
  welcome: '欢迎页',
  setup: '欢迎页',
  'script-workbench': 'AI 写稿工作台',
  settings: '系统设置',
};

const pageStatusMap: Record<Exclude<AppPage, 'editor'>, string> = {
  welcome: '未打开工程',
  setup: '未打开工程',
  'script-workbench': '脚本创作流程',
  settings: '全局配置',
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
  const toggleAgent = useAgentStore((s) => s.toggleSidebar);
  const agentStatus = useAgentStore((s) => s.status);

  const isEditorPage = page === 'editor';
  const visibleProjectName = isEditorPage ? projectName || '未命名工程' : pageTitleMap[page];
  const statusLabel = isEditorPage ? saveStatusLabelMap[saveStatus] : pageStatusMap[page];

  return (
    <header
      className={[styles.root, compact ? styles.compact : ''].filter(Boolean).join(' ')}
    >
      <div className={styles.leadingCluster}>
        {/* macOS hiddenInset 模式下系统会在此区域渲染原生红绿灯，留出占位 */}
        <div className={styles.trafficLightSpacer} aria-hidden="true" />

        {isEditorPage && (
          <div className={styles.historyActions} data-toolbar-history="true">
            <Button.Icon
              variant="ghost"
              aria-label="撤销"
              title="撤销"
              className={styles.historyButton}
              data-command="undo"
              data-enabled={canUndo ? 'true' : 'false'}
              disabled={!canUndo}
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
              data-enabled={canRedo ? 'true' : 'false'}
              disabled={!canRedo}
              onClick={() => onCommand('redo')}
            >
              <AppIcon name="redo-2" size={14} />
            </Button.Icon>
          </div>
        )}
      </div>

      {/* 居中标题（absolute 定位，不参与 flex 流） */}
      <div className={styles.titleArea}>
        <span className={styles.projectName}>{visibleProjectName}</span>
        <span className={styles.saveStatus}>{statusLabel}</span>
      </div>

      {/* 右侧操作区 */}
      <div className={styles.actions}>
        <Button.Icon
          variant="ghost"
          aria-label="AI Agent"
          title="AI Agent (⌘⇧A)"
          onClick={toggleAgent}
        >
          <BotMessageSquare
            size={16}
            style={{
              color: agentStatus === 'connected' || agentStatus === 'prompting' ? '#32D74B' : undefined,
            }}
          />
        </Button.Icon>
        {isEditorPage ? (
          <Button
            variant="primary"
            size="sm"
            aria-label="导出"
            onClick={() => onCommand('export')}
            leftIcon={<AppIcon name="upload" size={14} />}
          >
            导出
          </Button>
        ) : null}
      </div>
    </header>
  );
}
