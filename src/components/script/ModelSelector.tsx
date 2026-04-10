import { useEffect, useRef, useState } from 'react';
import { loadAISettings } from '../../store/ai';
import { useScriptStore } from '../../store/script';
import type { LLMProvider } from '../../types/ai';

/** 当前选中 Provider + Model 的下拉选择器 */
export function ModelSelector() {
  const selectedProviderId = useScriptStore((s) => s.selectedProviderId);
  const selectedModel = useScriptStore((s) => s.selectedModel);
  const setSelectedProvider = useScriptStore((s) => s.setSelectedProvider);

  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 初始化：加载 AI 配置，默认选中 defaultProviderId/defaultModel
  useEffect(() => {
    loadAISettings().then((settings) => {
      if (!settings) return;
      setProviders(settings.llmProviders ?? []);

      // 若尚未选中，设置默认值
      if (!selectedProviderId && settings.defaultProviderId) {
        setSelectedProvider(settings.defaultProviderId, settings.defaultModel);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // 计算显示文字
  const currentProvider = providers.find((p) => p.id === selectedProviderId);
  const label = currentProvider
    ? `🤖 ${currentProvider.name} / ${selectedModel ?? '—'}`
    : '🤖 选择模型 ▾';

  const handleSelect = (providerId: string, model: string) => {
    setSelectedProvider(providerId, model);
    setOpen(false);
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      {/* 触发按钮 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 6,
          background: open ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
          color: 'rgba(235,235,245,0.8)',
          fontSize: 12,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'background 0.1s',
        }}
        title="切换 AI 模型"
      >
        <span>{label}</span>
        <span style={{ opacity: 0.6, fontSize: 10 }}>▾</span>
      </button>

      {/* 下拉面板 */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 999,
            minWidth: 260,
            maxHeight: 320,
            overflowY: 'auto',
            background: '#2c2c2e',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            boxShadow: 'rgba(0,0,0,0.5) 0 8px 24px',
            padding: '6px 0',
          }}
        >
          {providers.length === 0 ? (
            <div
              style={{
                padding: '12px 16px',
                color: 'rgba(235,235,245,0.45)',
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              尚未配置 Provider，请前往系统设置添加
            </div>
          ) : (
            providers.map((provider) => (
              <div key={provider.id}>
                {/* Provider 分组标题 */}
                <div
                  style={{
                    padding: '6px 14px 3px',
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'rgba(235,235,245,0.4)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  {provider.name}
                </div>
                {/* 该 Provider 下的模型列表 */}
                {(provider.models ?? []).map((model) => {
                  const isSelected =
                    selectedProviderId === provider.id && selectedModel === model;
                  return (
                    <button
                      key={model}
                      type="button"
                      onClick={() => handleSelect(provider.id, model)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        padding: '6px 14px',
                        border: 'none',
                        background: isSelected
                          ? 'rgba(10,132,255,0.15)'
                          : 'transparent',
                        color: isSelected
                          ? '#0A84FF'
                          : 'rgba(235,235,245,0.8)',
                        fontSize: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected)
                          (e.currentTarget as HTMLButtonElement).style.background =
                            'rgba(255,255,255,0.06)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected)
                          (e.currentTarget as HTMLButtonElement).style.background =
                            'transparent';
                      }}
                    >
                      {/* 单选圆 */}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          border: `1.5px solid ${isSelected ? '#0A84FF' : 'rgba(255,255,255,0.25)'}`,
                          flexShrink: 0,
                        }}
                      >
                        {isSelected && (
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              background: '#0A84FF',
                            }}
                          />
                        )}
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {model}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
