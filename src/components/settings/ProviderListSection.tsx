import { useState } from 'react';
import type { LLMProvider } from '../../types/ai';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  ModalFooter,
  Select,
} from '../../ui';
import type { SelectOption } from '../../ui';
import { normalizeProviderDraft, validateProviderDraft } from './ai-config-utils';
import styles from './ProviderListSection.module.css';

/** 生成唯一 ID */
function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const PROVIDER_TYPE_OPTIONS: SelectOption[] = [
  { value: 'openai_compatible', label: 'OpenAI Compatible' },
  { value: 'anthropic', label: 'Anthropic' },
];

/** 空白 Provider 表单 */
function emptyProvider(): LLMProvider {
  return {
    id: genId(),
    name: '',
    type: 'openai_compatible',
    baseUrl: '',
    apiKey: '',
    models: [],
  };
}

// ─── 子组件：Provider 编辑弹窗 ────────────────────────────────────────────

interface DialogProps {
  initial: LLMProvider;
  isDefault: boolean;
  onSave: (p: LLMProvider, isDefault: boolean) => void;
  onCancel: () => void;
}

function ProviderDialog({ initial, isDefault, onSave, onCancel }: DialogProps) {
  const [form, setForm] = useState<LLMProvider>({ ...initial });
  const [setAsDefault, setSetAsDefault] = useState(isDefault);
  const [newModel, setNewModel] = useState('');
  const [errors, setErrors] = useState<ReturnType<typeof validateProviderDraft>>({});
  const title = initial.name ? '编辑 Provider' : '添加 Provider';

  const clearFieldError = (key: keyof ReturnType<typeof validateProviderDraft>) =>
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const set = <K extends keyof LLMProvider>(
    key: K,
    value: LLMProvider[K],
    errorKey?: keyof ReturnType<typeof validateProviderDraft>,
  ) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errorKey) {
      clearFieldError(errorKey);
    }
  };

  const addModel = () => {
    const m = newModel.trim();
    if (m && !form.models.includes(m)) {
      set('models', [...form.models, m], 'models');
    }
    setNewModel('');
  };

  const removeModel = (idx: number) =>
    set(
      'models',
      form.models.filter((_, i) => i !== idx),
      'models',
    );

  const handleConfirm = () => {
    const pendingModel = newModel.trim();
    const nextForm =
      pendingModel && !form.models.includes(pendingModel)
        ? { ...form, models: [...form.models, pendingModel] }
        : form;

    const nextErrors = validateProviderDraft(nextForm);
    setErrors(nextErrors);

    if (pendingModel) {
      setNewModel('');
      if (nextForm !== form) {
        setForm(nextForm);
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    onSave(normalizeProviderDraft(nextForm), setAsDefault);
  };

  return (
    <Dialog open onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent size="lg" className={styles.dialogContent}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody className={styles.dialogBody}>
          <Field label="名称" required error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value, 'name')}
              placeholder="例如：本地 Ollama"
              size="sm"
              aria-invalid={Boolean(errors.name)}
            />
          </Field>

          <Field label="类型">
            <Select
              value={form.type}
              options={PROVIDER_TYPE_OPTIONS}
              onChange={(e) => set('type', e.target.value as LLMProvider['type'])}
            />
          </Field>

          <Field label="Base URL" required error={errors.baseUrl}>
            <Input
              value={form.baseUrl}
              onChange={(e) => set('baseUrl', e.target.value, 'baseUrl')}
              placeholder="https://api.openai.com/v1"
              size="sm"
              aria-invalid={Boolean(errors.baseUrl)}
            />
          </Field>

          <Field label="API Key" required error={errors.apiKey}>
            <Input
              variant="password"
              value={form.apiKey}
              onChange={(e) => set('apiKey', e.target.value, 'apiKey')}
              placeholder="sk-..."
              size="sm"
              aria-invalid={Boolean(errors.apiKey)}
            />
          </Field>

          <Field label="模型列表" required error={errors.models}>
            {form.models.length > 0 ? (
              <div className={styles.modelList}>
                {form.models.map((m, idx) => (
                  <div key={`${m}-${idx}`} className={styles.modelItem}>
                    <Badge variant="secondary" size="xs">
                      {m}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={styles.removeModelButton}
                      onClick={() => removeModel(idx)}
                    >
                      移除
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.hintText}>暂未添加模型</p>
            )}
            <div className={styles.modelInputRow}>
              <Input
                value={newModel}
                onChange={(e) => setNewModel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addModel();
                  }
                }}
                placeholder="输入模型名后按 Enter 或点击添加"
                size="sm"
                wrapperClassName={styles.modelInput}
                aria-invalid={Boolean(errors.models)}
              />
              <Button type="button" variant="secondary" size="sm" onClick={addModel}>
                添加
              </Button>
            </div>
          </Field>

          <Checkbox
            label="设为默认 Provider"
            checked={setAsDefault}
            onChange={(checked) => setSetAsDefault(checked)}
            size="sm"
            className={styles.defaultCheckbox}
          />

          <ModalFooter
            onCancel={onCancel}
            onConfirm={handleConfirm}
            confirmLabel="保存"
            extra={
              Object.keys(errors).length > 0 ? (
                <span className={styles.footerError}>请先补全 Provider 的必填项</span>
              ) : null
            }
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// ─── 主组件 ───────────────────────────────────────────────────────────────

interface Props {
  providers: LLMProvider[];
  defaultProviderId: string | null;
  onChange: (providers: LLMProvider[], defaultId: string | null) => void;
}

export function ProviderListSection({ providers, defaultProviderId, onChange }: Props) {
  const [editTarget, setEditTarget] = useState<LLMProvider | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const handleSave = (updated: LLMProvider, setAsDefault: boolean) => {
    let next: LLMProvider[];
    if (isAdding) {
      next = [...providers, updated];
    } else {
      next = providers.map((p) => (p.id === updated.id ? updated : p));
    }
    const newDefaultId = setAsDefault ? updated.id : (defaultProviderId ?? null);
    onChange(next, newDefaultId);
    setEditTarget(null);
    setIsAdding(false);
  };

  const handleDelete = (id: string) => {
    const next = providers.filter((p) => p.id !== id);
    const newDefaultId =
      defaultProviderId === id ? (next[0]?.id ?? null) : (defaultProviderId ?? null);
    onChange(next, newDefaultId);
  };

  const openAdd = () => {
    setEditTarget(emptyProvider());
    setIsAdding(true);
  };

  const openEdit = (p: LLMProvider) => {
    setEditTarget({ ...p });
    setIsAdding(false);
  };

  const closeDialog = () => {
    setEditTarget(null);
    setIsAdding(false);
  };

  return (
    <div className={styles.root}>
      {providers.length === 0 ? (
        <EmptyState
          eyebrow="Provider"
          title="暂无 Provider"
          description="点击下方按钮添加你的第一个 Provider。"
          actions={
            <Button type="button" variant="secondary" onClick={openAdd}>
              + 添加 Provider
            </Button>
          }
        />
      ) : (
        <>
          <div className={styles.providerList}>
            {providers.map((p) => (
              <div key={p.id} className={styles.providerCard}>
                <div className={styles.providerHeader}>
                  <div className={styles.providerTitleGroup}>
                    <span className={styles.providerName}>{p.name || '未命名 Provider'}</span>
                    {p.id === defaultProviderId ? (
                      <Badge variant="info" size="xs">
                        默认
                      </Badge>
                    ) : null}
                  </div>
                  <div className={styles.providerActions}>
                    <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(p)}>
                      编辑
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(p.id)}
                    >
                      删除
                    </Button>
                  </div>
                </div>

                {p.baseUrl ? <span className={styles.providerBaseUrl}>{p.baseUrl}</span> : null}

                {p.models.length > 0 ? (
                  <div className={styles.providerModels}>
                    {p.models.map((m) => (
                      <Badge key={m} variant="secondary" size="xs">
                        {m}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className={styles.providerHint}>未配置模型</span>
                )}
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="secondary"
            className={styles.addProviderButton}
            onClick={openAdd}
          >
            + 添加 Provider
          </Button>
        </>
      )}

      {editTarget && (
        <ProviderDialog
          initial={editTarget}
          isDefault={isAdding ? false : editTarget.id === defaultProviderId}
          onSave={handleSave}
          onCancel={closeDialog}
        />
      )}
    </div>
  );
}
