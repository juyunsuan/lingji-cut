import { useMemo } from 'react';
import { Checkbox, Select } from '../../ui';
import type { SelectOption } from '../../ui';
import type {
  ImageProvider,
  LLMProvider,
  PromptBinding,
} from '../../types/ai';
import type { PromptKind } from '../../lib/prompts/types';
import styles from './PromptBindingBar.module.css';

export interface PromptBindingBarProps {
  scope: 'global' | 'project';
  kind: PromptKind;
  /** 当前作用域的显式绑定（undefined 表示继承） */
  binding: PromptBinding | undefined;
  llmProviders: LLMProvider[];
  /** 解析后的有效 Provider id（用于继承展示） */
  effectiveProviderId: string | null;
  /** 解析后的有效模型（用于继承展示） */
  effectiveModel: string | null;
  /** 修改 LLM 绑定；传 null 表示删除绑定（回到继承） */
  onChange: (next: PromptBinding | null) => void;
  /** 仅 cover.regeneration 开启 */
  showImageBinding?: boolean;
  imageProviders?: ImageProvider[];
  effectiveImageProviderId?: string | null;
  effectiveImageModel?: string | null;
  /** 修改文生图绑定（合并到同一 binding 中） */
  onImageChange?: (next: {
    imageProviderId: string | null;
    imageModel: string | null;
  }) => void;
}

function toProviderOptions(providers: Array<{ id: string; name: string }>): SelectOption[] {
  return providers.map((p) => ({ value: p.id, label: p.name || '未命名' }));
}

function toModelOptions(models: string[]): SelectOption[] {
  return models.map((m) => ({ value: m, label: m }));
}

export function PromptBindingBar({
  scope: _scope,
  kind: _kind,
  binding,
  llmProviders,
  effectiveProviderId,
  effectiveModel,
  onChange,
  showImageBinding = false,
  imageProviders = [],
  effectiveImageProviderId = null,
  effectiveImageModel = null,
  onImageChange,
}: PromptBindingBarProps) {
  // ─── LLM 段 ───────────────────────────────────────
  // 显式 LLM 绑定：当前作用域同时有 providerId 与 model 视为显式覆盖
  const isLlmInheriting = !binding || !binding.providerId || !binding.model;
  const displayLlmProviderId = isLlmInheriting
    ? effectiveProviderId
    : binding!.providerId!;
  const displayLlmModel = isLlmInheriting ? effectiveModel : binding!.model!;

  const llmProviderOptions = useMemo(
    () => toProviderOptions(llmProviders),
    [llmProviders],
  );
  const llmProvider = useMemo(
    () => llmProviders.find((p) => p.id === displayLlmProviderId) ?? null,
    [llmProviders, displayLlmProviderId],
  );
  const llmModelOptions = useMemo(
    () => toModelOptions(llmProvider?.models ?? []),
    [llmProvider],
  );

  const handleLlmInheritToggle = (inherit: boolean) => {
    if (inherit) {
      // 继承 LLM —— 但 cover.regeneration 时需要保留图像段
      if (showImageBinding && binding) {
        const next: PromptBinding = {
          providerId: null,
          model: null,
          imageProviderId: binding.imageProviderId ?? null,
          imageModel: binding.imageModel ?? null,
        };
        const hasImageOverride =
          Boolean(next.imageProviderId) && Boolean(next.imageModel);
        onChange(hasImageOverride ? next : null);
      } else {
        onChange(null);
      }
    } else {
      // 从继承切为显式覆盖：使用当前有效值作为初始
      const providerId = effectiveProviderId ?? llmProviders[0]?.id ?? null;
      const provider = llmProviders.find((p) => p.id === providerId) ?? null;
      const model =
        effectiveModel && provider?.models.includes(effectiveModel)
          ? effectiveModel
          : (provider?.models[0] ?? null);
      if (!providerId || !model) return;
      onChange({
        providerId,
        model,
        imageProviderId: binding?.imageProviderId ?? null,
        imageModel: binding?.imageModel ?? null,
      });
    }
  };

  const handleLlmProviderChange = (providerId: string) => {
    const provider = llmProviders.find((p) => p.id === providerId);
    const firstModel = provider?.models[0] ?? null;
    if (!firstModel) return;
    onChange({
      providerId,
      model: firstModel,
      imageProviderId: binding?.imageProviderId ?? null,
      imageModel: binding?.imageModel ?? null,
    });
  };

  const handleLlmModelChange = (model: string) => {
    const providerId = binding?.providerId ?? effectiveProviderId;
    if (!providerId) return;
    onChange({
      providerId,
      model,
      imageProviderId: binding?.imageProviderId ?? null,
      imageModel: binding?.imageModel ?? null,
    });
  };

  // ─── 图像段（仅 cover.regeneration）────────────────
  const isImgInheriting =
    !binding || !binding.imageProviderId || !binding.imageModel;
  const displayImgProviderId = isImgInheriting
    ? effectiveImageProviderId
    : binding!.imageProviderId!;
  const displayImgModel = isImgInheriting
    ? effectiveImageModel
    : binding!.imageModel!;

  const imgProviderOptions = useMemo(
    () => toProviderOptions(imageProviders),
    [imageProviders],
  );
  const imgProvider = useMemo(
    () => imageProviders.find((p) => p.id === displayImgProviderId) ?? null,
    [imageProviders, displayImgProviderId],
  );
  const imgModelOptions = useMemo(
    () => toModelOptions(imgProvider?.models ?? []),
    [imgProvider],
  );

  const handleImgInheritToggle = (inherit: boolean) => {
    if (!onImageChange) return;
    if (inherit) {
      onImageChange({ imageProviderId: null, imageModel: null });
    } else {
      const providerId =
        effectiveImageProviderId ?? imageProviders[0]?.id ?? null;
      const provider = imageProviders.find((p) => p.id === providerId) ?? null;
      const model =
        effectiveImageModel && provider?.models.includes(effectiveImageModel)
          ? effectiveImageModel
          : (provider?.models[0] ?? null);
      if (!providerId || !model) return;
      onImageChange({ imageProviderId: providerId, imageModel: model });
    }
  };

  const handleImgProviderChange = (providerId: string) => {
    if (!onImageChange) return;
    const provider = imageProviders.find((p) => p.id === providerId);
    const firstModel = provider?.models[0] ?? null;
    if (!firstModel) return;
    onImageChange({ imageProviderId: providerId, imageModel: firstModel });
  };

  const handleImgModelChange = (model: string) => {
    if (!onImageChange) return;
    const providerId = binding?.imageProviderId ?? effectiveImageProviderId;
    if (!providerId) return;
    onImageChange({ imageProviderId: providerId, imageModel: model });
  };

  return (
    <div className={styles.root}>
      {/* ─── LLM 绑定行 ─────────────────────────── */}
      <div className={styles.row}>
        <span className={styles.rowLabel}>AI 绑定</span>
        <Checkbox
          className={styles.inheritToggle}
          label="继承"
          size="sm"
          checked={isLlmInheriting}
          onChange={(checked) => handleLlmInheritToggle(checked)}
        />
        <div className={styles.selectCell}>
          <span className={styles.selectCellLabel}>Provider</span>
          {isLlmInheriting ? (
            <span className={styles.inheritedValue}>
              {llmProvider?.name ?? '（未配置默认 Provider）'}
            </span>
          ) : (
            <Select
              className={styles.select}
              value={displayLlmProviderId ?? ''}
              options={llmProviderOptions}
              onChange={(e) => handleLlmProviderChange(e.target.value)}
              placeholder="选择 Provider"
            />
          )}
        </div>
        <div className={styles.selectCell}>
          <span className={styles.selectCellLabel}>Model</span>
          {isLlmInheriting ? (
            <span className={styles.inheritedValue}>
              {displayLlmModel ?? '（未配置默认 Model）'}
            </span>
          ) : (
            <Select
              className={styles.select}
              value={displayLlmModel ?? ''}
              options={llmModelOptions}
              onChange={(e) => handleLlmModelChange(e.target.value)}
              placeholder="选择 Model"
            />
          )}
        </div>
        {!isLlmInheriting && (
          <button
            type="button"
            className={styles.resetLink}
            onClick={() => handleLlmInheritToggle(true)}
          >
            重置为继承
          </button>
        )}
      </div>

      {/* ─── 图像绑定行（仅 cover.regeneration）──── */}
      {showImageBinding && onImageChange && (
        <>
          <div className={styles.divider} />
          <div className={styles.row}>
            <span className={styles.rowLabel}>文生图（最终出图）</span>
            <Checkbox
              className={styles.inheritToggle}
              label="继承"
              size="sm"
              checked={isImgInheriting}
              onChange={(checked) => handleImgInheritToggle(checked)}
            />
            <div className={styles.selectCell}>
              <span className={styles.selectCellLabel}>Provider</span>
              {isImgInheriting ? (
                <span className={styles.inheritedValue}>
                  {imgProvider?.name ?? '（未配置默认 ImageProvider）'}
                </span>
              ) : (
                <Select
                  className={styles.select}
                  value={displayImgProviderId ?? ''}
                  options={imgProviderOptions}
                  onChange={(e) => handleImgProviderChange(e.target.value)}
                  placeholder="选择 ImageProvider"
                />
              )}
            </div>
            <div className={styles.selectCell}>
              <span className={styles.selectCellLabel}>Model</span>
              {isImgInheriting ? (
                <span className={styles.inheritedValue}>
                  {displayImgModel ?? '（未配置默认 Model）'}
                </span>
              ) : (
                <Select
                  className={styles.select}
                  value={displayImgModel ?? ''}
                  options={imgModelOptions}
                  onChange={(e) => handleImgModelChange(e.target.value)}
                  placeholder="选择 Model"
                />
              )}
            </div>
            {!isImgInheriting && (
              <button
                type="button"
                className={styles.resetLink}
                onClick={() => handleImgInheritToggle(true)}
              >
                重置为继承
              </button>
            )}
          </div>
          <div className={styles.imageNote}>
            ↳ 该提示词输出会被送往上方文生图模型生图
          </div>
        </>
      )}
    </div>
  );
}
