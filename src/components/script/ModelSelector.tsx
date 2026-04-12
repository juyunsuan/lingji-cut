import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
} from '../../ui';
import { loadAISettings } from '../../store/ai';
import { useScriptStore } from '../../store/script';
import type { LLMProvider } from '../../types/ai';
import styles from './ModelSelector.module.css';

/** 当前选中 Provider + Model 的下拉选择器 */
export function ModelSelector() {
  const selectedProviderId = useScriptStore((s) => s.selectedProviderId);
  const selectedModel = useScriptStore((s) => s.selectedModel);
  const setSelectedProvider = useScriptStore((s) => s.setSelectedProvider);

  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [open, setOpen] = useState(false);

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

  // 计算显示文字
  const currentProvider = providers.find((p) => p.id === selectedProviderId);
  const label = useMemo(
    () =>
      currentProvider
        ? `🤖 ${currentProvider.name} / ${selectedModel ?? '—'}`
        : '🤖 选择模型',
    [currentProvider, selectedModel],
  );

  const handleSelect = (providerId: string, model: string) => {
    setSelectedProvider(providerId, model);
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className={styles.trigger} title="切换 AI 模型">
          <span className={styles.triggerLabel}>{label}</span>
          <span className={styles.triggerArrow} aria-hidden="true">
            ▾
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="bottom" sideOffset={6} className={styles.menuContent}>
        {providers.length === 0 ? (
          <div className={styles.emptyWrap}>
            <EmptyState
              title="尚未配置 Provider"
              description="请前往系统设置添加 Provider 后再选择模型。"
            />
          </div>
        ) : (
          providers.map((provider, index) => (
            <div key={provider.id}>
              <DropdownMenuLabel className={styles.groupLabel}>{provider.name}</DropdownMenuLabel>
              {(provider.models ?? []).length > 0 ? (
                (provider.models ?? []).map((model) => {
                  const isSelected = selectedProviderId === provider.id && selectedModel === model;
                  return (
                    <DropdownMenuCheckboxItem
                      key={model}
                      checked={isSelected}
                      onCheckedChange={() => handleSelect(provider.id, model)}
                      className={styles.modelItem}
                    >
                      <span className={styles.modelName}>{model}</span>
                    </DropdownMenuCheckboxItem>
                  );
                })
              ) : (
                <div className={styles.emptyModelRow}>该 Provider 暂无模型</div>
              )}

              {index < providers.length - 1 ? <DropdownMenuSeparator /> : null}
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
