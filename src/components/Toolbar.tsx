import type { MenuAction } from '../lib/electron-api';
import type { SaveStatus } from '../store/timeline';

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

const baseMenuButtonStyle = {
  height: 36,
  padding: '0 14px',
  borderRadius: 12,
  border: '1px solid rgba(148, 163, 184, 0.16)',
  background: 'rgba(15, 23, 42, 0.6)',
  color: '#f8fafc',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  transition: 'all 150ms ease-out',
};

export function Toolbar({
  compact,
  page,
  projectName,
  saveStatus,
  onCommand,
}: ToolbarProps) {
  const helperText =
    page === 'setup'
      ? '导入 MP3 与 SRT 后，即可进入时间轴编辑。'
      : '拖入素材、调整时间轴，并直接导出 Remotion 视频。';
  const saveStatusLabel = saveStatusLabelMap[saveStatus];
  const visibleProjectName = projectName || (page === 'editor' ? '未命名工程' : '欢迎页');

  return (
    <div
      style={{
        minHeight: compact ? 66 : 62,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 14,
        padding: compact ? '10px 16px' : '10px 20px',
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
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 11,
            letterSpacing: '0.20em',
            color: '#38bdf8',
            fontWeight: 800,
            textTransform: 'uppercase',
          }}>
            VIDEO WEB MASTER
          </div>
          <div style={{ marginTop: 3, fontSize: compact ? 17 : 18, fontWeight: 800, color: '#f8fafc' }}>
            播客视频编辑器
          </div>
          <div
            style={{
              marginTop: 5,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: '#94a3b8',
              fontSize: 12,
            }}
          >
            <span style={{ fontWeight: 500 }}>{visibleProjectName}</span>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                background:
                  saveStatus === 'error'
                    ? 'rgba(239, 68, 68, 0.18)'
                    : 'rgba(148, 163, 184, 0.10)',
                color: saveStatus === 'error' ? '#fca5a5' : '#cbd5e1',
                fontWeight: 600,
                border: saveStatus === 'error'
                  ? '1px solid rgba(239, 68, 68, 0.35)'
                  : '1px solid rgba(148, 163, 184, 0.15)',
              }}
            >
              {saveStatusLabel}
            </span>
          </div>
        </div>
        <div
          style={{
            color: '#64748b',
            fontSize: 12,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textAlign: 'right',
            fontWeight: 500,
          }}
        >
          {helperText}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          color: '#94a3b8',
          fontSize: 12,
          WebkitAppRegion: 'no-drag',
        }}
      >
        <div style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
          {page === 'editor' ? '编辑中' : '准备导入'}
        </div>
        <button
          type="button"
          disabled={page !== 'editor'}
          onClick={() => onCommand('export')}
          style={{
            ...baseMenuButtonStyle,
            color: page === 'editor' ? '#f8fafc' : '#475569',
            cursor: page === 'editor' ? 'pointer' : 'not-allowed',
            background: page === 'editor'
              ? 'linear-gradient(135deg, rgba(249, 115, 22, 0.22) 0%, rgba(234, 88, 12, 0.14) 100%)'
              : 'rgba(15, 23, 42, 0.6)',
            borderColor: page === 'editor'
              ? 'rgba(249, 115, 22, 0.35)'
              : 'rgba(148, 163, 184, 0.16)',
          }}
        >
          导出 MP4
        </button>
      </div>
    </div>
  );
}
