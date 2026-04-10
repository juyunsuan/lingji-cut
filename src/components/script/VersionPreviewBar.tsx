import { useState } from 'react';
import { useScriptStore } from '../../store/script';

/** 格式化时间 */
function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${mo}-${dd} ${hh}:${mm}`;
}

/**
 * 历史版本预览横幅
 * 当 historyPreview.active === true 时显示
 */
export function VersionPreviewBar() {
  const historyPreview = useScriptStore((s) => s.historyPreview);
  const exitHistoryPreview = useScriptStore((s) => s.exitHistoryPreview);
  const setScriptText = useScriptStore((s) => s.setScriptText);
  const setFileDirty = useScriptStore((s) => s.setFileDirty);
  const markReviewStale = useScriptStore((s) => s.markReviewStale);
  const projectDir = useScriptStore((s) => s.projectDir);
  const scriptText = useScriptStore((s) => s.scriptText);

  const [labelInput, setLabelInput] = useState('');
  const [editingLabel, setEditingLabel] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!historyPreview.active || !historyPreview.versionMeta) return null;

  const { versionId, content, versionMeta } = historyPreview;
  const { source, providerName, modelName, createdAt, label } = versionMeta;

  const isAI = source === 'ai';
  const sourceLabel = isAI ? '🤖 AI 生成' : '✏️ 手动保存';

  // 恢复此版本
  const handleRollback = async () => {
    if (versionId === null || content === null || !projectDir) return;
    setSaving(true);
    try {
      const result = await window.scriptHistoryAPI.rollback(
        versionId,
        scriptText,
        projectDir,
        'script.md',
      );
      setScriptText(result.rollbackContent);
      setFileDirty('script.md', true);
      markReviewStale();
      // 保存到磁盘
      if (window.electronAPI?.saveScriptFile) {
        await window.electronAPI.saveScriptFile(projectDir, 'script.md', result.rollbackContent);
        setFileDirty('script.md', false);
      }
    } finally {
      setSaving(false);
      exitHistoryPreview();
    }
  };

  // 添加/保存标签
  const handleSaveLabel = async () => {
    if (versionId === null || !projectDir) return;
    await window.scriptHistoryAPI.updateLabel(projectDir, versionId, labelInput.trim() || null);
    setEditingLabel(false);
    setLabelInput('');
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        background: '#332b00',
        borderBottom: '1px solid rgba(255,196,0,0.3)',
        flexWrap: 'wrap',
      }}
    >
      {/* 主要信息 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flex: '1 1 auto',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
        <span
          style={{
            fontSize: 12,
            color: 'rgba(255,220,100,0.9)',
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          正在预览历史版本 —
        </span>
        <span
          style={{
            fontSize: 12,
            color: 'rgba(255,220,100,0.7)',
            whiteSpace: 'nowrap',
          }}
        >
          {formatTime(createdAt)}
        </span>
        <span
          style={{
            fontSize: 11,
            color: 'rgba(255,220,100,0.55)',
            whiteSpace: 'nowrap',
          }}
        >
          {sourceLabel}
          {providerName && ` · ${providerName}${modelName ? ` / ${modelName}` : ''}`}
        </span>
        {label && (
          <span
            style={{
              fontSize: 11,
              color: 'rgba(255,220,100,0.7)',
              fontStyle: 'italic',
              flexShrink: 0,
            }}
          >
            「{label}」
          </span>
        )}
      </div>

      {/* 操作区 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {/* 添加标签 */}
        {editingLabel ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              autoFocus
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSaveLabel();
                if (e.key === 'Escape') {
                  setEditingLabel(false);
                  setLabelInput('');
                }
              }}
              placeholder="输入标签…"
              style={{
                padding: '3px 7px',
                fontSize: 11,
                borderRadius: 5,
                border: '1px solid rgba(255,196,0,0.35)',
                background: 'rgba(0,0,0,0.3)',
                color: 'rgba(255,220,100,0.9)',
                outline: 'none',
                width: 120,
              }}
            />
            <button
              type="button"
              onClick={() => void handleSaveLabel()}
              style={btnStyle('rgba(255,196,0,0.15)', 'rgba(255,220,100,0.8)')}
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingLabel(false);
                setLabelInput('');
              }}
              style={btnStyle('rgba(255,255,255,0.06)', 'rgba(235,235,245,0.5)')}
            >
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditingLabel(true);
              setLabelInput(label ?? '');
            }}
            style={btnStyle('rgba(255,196,0,0.1)', 'rgba(255,220,100,0.75)')}
          >
            添加标签
          </button>
        )}

        {/* 恢复此版本 */}
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleRollback()}
          style={btnStyle('rgba(255,196,0,0.25)', 'rgba(255,220,100,0.95)', saving)}
        >
          {saving ? '恢复中…' : '恢复此版本'}
        </button>

        {/* 返回当前 */}
        <button
          type="button"
          onClick={exitHistoryPreview}
          style={btnStyle('rgba(255,255,255,0.08)', 'rgba(235,235,245,0.7)')}
        >
          返回当前
        </button>
      </div>
    </div>
  );
}

/** 统一按钮样式生成 */
function btnStyle(
  bg: string,
  color: string,
  disabled = false,
): React.CSSProperties {
  return {
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 500,
    borderRadius: 6,
    border: '1px solid rgba(255,196,0,0.2)',
    background: bg,
    color,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    whiteSpace: 'nowrap' as const,
    transition: 'background 0.1s',
  };
}
