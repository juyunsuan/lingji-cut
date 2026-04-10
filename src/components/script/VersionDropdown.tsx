import { useEffect, useRef, useState } from 'react';
import { useScriptStore } from '../../store/script';

type VersionMeta = {
  id: number;
  fileName: string;
  source: string;
  providerName: string | null;
  modelName: string | null;
  label: string | null;
  byteSize: number;
  createdAt: string;
};

type FilterTab = '全部' | '仅AI' | '仅手动';

/** 格式化时间 */
function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小时前`;
  // 超过 24h 显示日期
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${mo}-${dd} ${hh}:${mm}`;
}

/** 版本历史下拉面板（仅在 openedFile === 'script.md' 时显示） */
export function VersionDropdown() {
  const openedFile = useScriptStore((s) => s.openedFile);
  const projectDir = useScriptStore((s) => s.projectDir);
  const enterHistoryPreview = useScriptStore((s) => s.enterHistoryPreview);

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterTab>('全部');
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 只在 script.md 时渲染
  if (openedFile !== 'script.md') return null;

  // 打开时加载版本列表
  const loadVersions = async () => {
    if (!projectDir || typeof window === 'undefined' || !window.scriptHistoryAPI) return;
    setLoading(true);
    try {
      const list = await window.scriptHistoryAPI.list(projectDir, 'script.md', { limit: 50 });
      setVersions(list);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void loadVersions();
  };

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelectVersion = async (v: VersionMeta) => {
    if (!projectDir) return;
    const detail = await window.scriptHistoryAPI.get(projectDir, v.id);
    if (!detail) return;
    enterHistoryPreview(v.id, detail.content, {
      id: v.id,
      fileName: v.fileName,
      source: v.source,
      providerName: v.providerName,
      modelName: v.modelName,
      label: v.label,
      byteSize: v.byteSize,
      createdAt: v.createdAt,
    });
    setOpen(false);
  };

  const filteredVersions = versions.filter((v) => {
    if (filter === '仅AI') return v.source === 'ai';
    if (filter === '仅手动') return v.source !== 'ai';
    return true;
  });

  const filterTabs: FilterTab[] = ['全部', '仅AI', '仅手动'];

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      {/* 触发按钮 */}
      <button
        type="button"
        onClick={handleToggle}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 10px',
          border: 'none',
          background: 'transparent',
          color: '#0A84FF',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          borderRadius: 4,
          transition: 'background 0.1s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(10,132,255,0.1)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
        title="查看历史版本"
      >
        🕐 历史版本 ▾
      </button>

      {/* 下拉面板 */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            zIndex: 999,
            width: 320,
            background: '#1c1c1e',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
            boxShadow: 'rgba(0,0,0,0.6) 0 12px 32px',
            overflow: 'hidden',
          }}
        >
          {/* 筛选 Tab */}
          <div
            style={{
              display: 'flex',
              gap: 2,
              padding: '8px 10px 6px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {filterTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                style={{
                  flex: 1,
                  padding: '4px 0',
                  border: 'none',
                  borderRadius: 6,
                  background:
                    filter === tab ? 'rgba(10,132,255,0.2)' : 'transparent',
                  color:
                    filter === tab ? '#0A84FF' : 'rgba(235,235,245,0.45)',
                  fontSize: 11,
                  fontWeight: filter === tab ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* 版本列表 */}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {loading ? (
              <div
                style={{
                  padding: '20px 16px',
                  color: 'rgba(235,235,245,0.4)',
                  fontSize: 12,
                  textAlign: 'center',
                }}
              >
                加载中…
              </div>
            ) : filteredVersions.length === 0 ? (
              <div
                style={{
                  padding: '20px 16px',
                  color: 'rgba(235,235,245,0.4)',
                  fontSize: 12,
                  textAlign: 'center',
                }}
              >
                暂无版本记录
              </div>
            ) : (
              filteredVersions.map((v, idx) => {
                const isAI = v.source === 'ai';
                const barColor = isAI ? '#a78bfa' : '#8e8e93';
                const icon = isAI ? '🤖' : '✏️';
                const sourceLabel = isAI ? 'AI 生成' : '手动保存';

                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => void handleSelectVersion(v)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      width: '100%',
                      padding: '10px 14px',
                      border: 'none',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        'rgba(255,255,255,0.05)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        'transparent';
                    }}
                  >
                    {/* 左侧彩色竖条 */}
                    <span
                      style={{
                        width: 3,
                        minWidth: 3,
                        height: 38,
                        borderRadius: 2,
                        background: barColor,
                        marginTop: 1,
                        flexShrink: 0,
                      }}
                    />

                    {/* 内容 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* 第一行：图标 + 时间 + 当前版本标记 */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          marginBottom: 3,
                        }}
                      >
                        <span style={{ fontSize: 13 }}>{icon}</span>
                        <span
                          style={{
                            fontSize: 12,
                            color: 'rgba(235,235,245,0.8)',
                            fontWeight: 500,
                          }}
                        >
                          {formatTime(v.createdAt)}
                        </span>
                        {idx === 0 && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: '1px 5px',
                              borderRadius: 4,
                              background: 'rgba(10,132,255,0.2)',
                              color: '#0A84FF',
                              fontWeight: 600,
                            }}
                          >
                            当前版本
                          </span>
                        )}
                      </div>

                      {/* 第二行：来源 + Provider/Model */}
                      <div
                        style={{
                          fontSize: 11,
                          color: 'rgba(235,235,245,0.4)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {sourceLabel}
                        {v.providerName && (
                          <>
                            {' · '}
                            {v.providerName}
                            {v.modelName ? ` / ${v.modelName}` : ''}
                          </>
                        )}
                        {v.label && (
                          <span
                            style={{
                              marginLeft: 6,
                              color: 'rgba(235,235,245,0.6)',
                              fontStyle: 'italic',
                            }}
                          >
                            「{v.label}」
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
