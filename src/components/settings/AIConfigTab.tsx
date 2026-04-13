import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadAISettings, saveAISettings } from '../../store/ai';
import { Field, Divider, Switch, Select, Input, SaveButton, SettingsPageHeader } from '../../ui';
import type { SelectOption } from '../../ui';
import { DEFAULT_JIMENG_MODEL, type LLMProvider } from '../../types/ai';
import { ProviderListSection } from './ProviderListSection';
import {
  createAIConfigSnapshot,
  hasUnsavedAIConfigChanges,
  normalizeProviderDrafts,
  normalizeProviderSelection,
} from './ai-config-utils';
import { useSettingsTabGuard } from './useSettingsTabGuard';
import styles from './SettingsCommon.module.css';

const JIMENG_MODEL_OPTIONS: SelectOption[] = [
  { value: 'jimeng-5.0', label: 'jimeng-5.0（默认，国内站 / 亚洲国际站）' },
  { value: 'jimeng-4.6', label: 'jimeng-4.6（国内站 / 亚洲国际站）' },
  { value: 'jimeng-4.5', label: 'jimeng-4.5（全站 · 2k/4k 全 ratio）' },
  { value: 'jimeng-4.1', label: 'jimeng-4.1（全站 · 2k/4k 全 ratio）' },
  { value: 'jimeng-4.0', label: 'jimeng-4.0（全站）' },
];

interface AIConfigTabProps {
  onRegisterLeaveGuard?: (guard: (() => Promise<boolean>) | null) => void;
}

export function AIConfigTab({ onRegisterLeaveGuard }: AIConfigTabProps) {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(null);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [enableThinking, setEnableThinking] = useState(true);
  const [jimengApiUrl, setJimengApiUrl] = useState('');
  const [jimengSessionId, setJimengSessionId] = useState('');
  const [jimengModel, setJimengModel] = useState(DEFAULT_JIMENG_MODEL);
  const [saved, setSaved] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState('');
  const saveFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void loadAISettings().then((settings) => {
      const nextProviders = settings?.llmProviders ?? [];
      const nextEnableThinking = settings?.enableThinking ?? true;
      const nextJimengApiUrl = settings?.jimengApiUrl ?? '';
      const nextJimengSessionId = settings?.jimengSessionId ?? '';
      const nextJimengModel = settings?.jimengModel ?? DEFAULT_JIMENG_MODEL;
      const selection = normalizeProviderSelection(
        nextProviders,
        settings?.defaultProviderId ?? null,
        settings?.defaultModel ?? null,
      );

      setProviders(nextProviders);
      setDefaultProviderId(selection.defaultProviderId);
      setDefaultModel(selection.defaultModel);
      setEnableThinking(nextEnableThinking);
      setJimengApiUrl(nextJimengApiUrl);
      setJimengSessionId(nextJimengSessionId);
      setJimengModel(nextJimengModel);
      setLastSavedSnapshot(
        createAIConfigSnapshot({
          providers: nextProviders,
          defaultProviderId: selection.defaultProviderId,
          defaultModel: selection.defaultModel,
          enableThinking: nextEnableThinking,
          jimengApiUrl: nextJimengApiUrl,
          jimengSessionId: nextJimengSessionId,
          jimengModel: nextJimengModel,
        }),
      );
      setHasLoaded(true);
    });
  }, []);

  useEffect(
    () => () => {
      if (saveFeedbackTimerRef.current) {
        clearTimeout(saveFeedbackTimerRef.current);
      }
    },
    [],
  );

  const currentSnapshot = useMemo(
    () =>
      createAIConfigSnapshot({
        providers,
        defaultProviderId,
        defaultModel,
        enableThinking,
        jimengApiUrl,
        jimengSessionId,
        jimengModel,
      }),
    [
      providers,
      defaultProviderId,
      defaultModel,
      enableThinking,
      jimengApiUrl,
      jimengSessionId,
      jimengModel,
    ],
  );

  const hasUnsavedChanges =
    hasLoaded && hasUnsavedAIConfigChanges(lastSavedSnapshot, currentSnapshot);

  useEffect(() => {
    if (hasUnsavedChanges && saved) {
      setSaved(false);
    }
  }, [hasUnsavedChanges, saved]);

  const handleSave = useCallback(async () => {
    const normalizedProviders = normalizeProviderDrafts(providers);
    const selection = normalizeProviderSelection(
      normalizedProviders,
      defaultProviderId,
      defaultModel,
    );
    const snapshot = createAIConfigSnapshot({
      providers: normalizedProviders,
      defaultProviderId: selection.defaultProviderId,
      defaultModel: selection.defaultModel,
      enableThinking,
      jimengApiUrl,
      jimengSessionId,
      jimengModel,
    });

    try {
      const current = await loadAISettings();
      await saveAISettings({
        ...(current ?? { minimaxApiKey: '', minimaxVoiceId: 'male-qn-qingse', minimaxSpeed: 1.0 }),
        llmProviders: normalizedProviders,
        defaultProviderId: selection.defaultProviderId,
        defaultModel: selection.defaultModel,
        llmBaseUrl:
          normalizedProviders.find((p) => p.id === selection.defaultProviderId)?.baseUrl ??
          current?.llmBaseUrl ??
          '',
        llmApiKey:
          normalizedProviders.find((p) => p.id === selection.defaultProviderId)?.apiKey ??
          current?.llmApiKey ??
          '',
        llmModel: selection.defaultModel ?? current?.llmModel ?? '',
        enableThinking,
        jimengApiUrl,
        jimengSessionId,
        jimengModel,
      });

      setProviders(normalizedProviders);
      setDefaultProviderId(selection.defaultProviderId);
      setDefaultModel(selection.defaultModel);
      setLastSavedSnapshot(snapshot);
      setSaved(true);
      if (saveFeedbackTimerRef.current) {
        clearTimeout(saveFeedbackTimerRef.current);
      }
      saveFeedbackTimerRef.current = setTimeout(() => setSaved(false), 2000);
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? `保存配置失败：${error.message}` : '保存配置失败，请稍后重试。');
      return false;
    }
  }, [
    providers,
    defaultProviderId,
    defaultModel,
    enableThinking,
    jimengApiUrl,
    jimengSessionId,
    jimengModel,
  ]);

  useSettingsTabGuard({
    title: 'AI 基础配置',
    hasUnsavedChanges,
    onSave: handleSave,
    onRegisterLeaveGuard,
  });

  return (
    <>
      <SettingsPageHeader
        title="AI 基础配置"
        description="配置 OpenAI 兼容接口与即梦图片生成服务"
      />

      <div className={styles.formStack}>
        {/* Provider 列表 */}
        <Field label="LLM Providers">
          <ProviderListSection
            providers={providers}
            defaultProviderId={defaultProviderId}
            onChange={(p, id) => {
              const selection = normalizeProviderSelection(p, id, defaultModel);
              setProviders(p);
              setDefaultProviderId(selection.defaultProviderId);
              setDefaultModel(selection.defaultModel);
            }}
          />
        </Field>

        <Field
          label="开启思考模式"
          hint="默认开启；关闭后会向兼容 OpenAI 的接口追加 enable_thinking=false"
        >
          <Switch checked={enableThinking} onChange={(checked) => setEnableThinking(checked)} />
        </Field>

        <Divider label="封面生成（即梦）" />

        <Field label="即梦 API URL">
          <Input
            value={jimengApiUrl}
            onChange={(e) => setJimengApiUrl(e.target.value)}
            placeholder="https://jimeng.example.com"
            size="sm"
          />
        </Field>
        <Field label="即梦 Session ID">
          <Input
            variant="password"
            value={jimengSessionId}
            onChange={(e) => setJimengSessionId(e.target.value)}
            placeholder="session id"
            size="sm"
          />
        </Field>
        <Field label="即梦模型">
          <Select
            value={jimengModel}
            options={JIMENG_MODEL_OPTIONS}
            onChange={(e) => setJimengModel(e.target.value)}
          />
        </Field>
      </div>

      <SaveButton
        onClick={() => {
          void handleSave();
        }}
        saved={saved}
        disabled={!hasLoaded || !hasUnsavedChanges}
        defaultLabel="保存配置"
        className={styles.saveButton}
      />
    </>
  );
}
