import { AppIcon, type AppIconName } from './AppIcon';
import type { MenuAction } from '../lib/electron-api';
import type { SaveStatus } from '../store/timeline';
import { Badge, Button } from '../ui/primitives';

interface ToolbarProps {
  compact: boolean;
  page: 'setup' | 'editor';
  projectName: string;
  saveStatus: SaveStatus;
  onCommand: (command: MenuAction) => void;
}

const saveStatusLabelMap: Record<SaveStatus, string> = {
  idle: '未打开工程',
  saving: '保存中',
  saved: '已保存',
  error: '保存失败',
};

const saveStatusMetaMap: Record<SaveStatus, { icon: AppIconName; color: string }> = {
  idle: { icon: 'circle', color: '#64748b' },
  saving: { icon: 'refresh-cw', color: '#38bdf8' },
  saved: { icon: 'circle-check-big', color: '#22c55e' },
  error: { icon: 'alert-circle', color: '#f87171' },
};

export function Toolbar({
  compact,
  page,
  projectName,
  saveStatus,
  onCommand,
}: ToolbarProps) {
  const saveStatusLabel = saveStatusLabelMap[saveStatus];
  const saveStatusMeta = saveStatusMetaMap[saveStatus];
  const visibleProjectName = projectName || (page === 'editor' ? '未命名工程' : '欢迎页');
  const controlHeight = compact ? 34 : 36;
  const controlRadius = compact ? 11 : 12;
  const controlFontSize = 13;
  const chromeSpacerWidth = compact ? 76 : 94;

  return (
    <div
      style={{
        minHeight: compact ? 50 : 54,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, auto) minmax(0, 1fr)',
        alignItems: 'center',
        gap: 12,
        padding: compact ? '8px 16px' : '9px 18px',
        borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
        background: 'linear-gradient(180deg, rgba(2, 6, 23, 0.98) 0%, rgba(15, 23, 42, 0.92) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        WebkitAppRegion: 'drag',
        userSelect: 'none',
      }}
      >
      <div
        style={{
          minWidth: chromeSpacerWidth,
          height: controlHeight,
          display: 'flex',
          alignItems: 'center',
          justifySelf: 'start',
        }}
      />
      <div
        style={{
          minWidth: 0,
          maxWidth: compact ? 'min(58vw, 480px)' : 'min(54vw, 560px)',
          height: controlHeight,
          display: 'inline-flex',
          alignItems: 'center',
          justifySelf: 'center',
          gap: 10,
          padding: compact ? '0 12px' : '0 14px',
          borderRadius: controlRadius,
          border: '1px solid rgba(148, 163, 184, 0.16)',
          background: 'rgba(15, 23, 42, 0.48)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
        }}
        title={saveStatusLabel}
      >
        <span
          aria-label={saveStatusLabel}
          style={{
            width: 16,
            height: 16,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: saveStatusMeta.color,
            flexShrink: 0,
          }}
        >
          <AppIcon name={saveStatusMeta.icon} size={14} />
        </span>
        <span
          style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: controlFontSize,
            fontWeight: 700,
            color: '#f8fafc',
            letterSpacing: '0.01em',
          }}
        >
          {visibleProjectName}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifySelf: 'end',
          WebkitAppRegion: 'no-drag',
        }}
      >
        {!compact ? <Badge variant={saveStatus === 'error' ? 'danger' : saveStatus === 'saved' ? 'success' : 'neutral'}>{saveStatusLabel}</Badge> : null}
        <Button
          disabled={page !== 'editor'}
          onClick={() => onCommand('export')}
          variant={page === 'editor' ? 'tint' : 'secondary'}
          size={compact ? 'sm' : 'md'}
          style={{ height: controlHeight, borderRadius: controlRadius, fontSize: controlFontSize }}
        >
          导出 MP4
        </Button>
      </div>
    </div>
  );
}
