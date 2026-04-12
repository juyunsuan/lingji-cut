import { useState, useEffect } from 'react';
import { loadAISettings, saveAISettings } from '../../store/ai';
import { Field, Divider, Switch, Select, Input, SaveButton, SettingsPageHeader } from '../../ui';
import type { SelectOption } from '../../ui';
import type { LLMProvider } from '../../types/ai';
import { ProviderListSection } from './ProviderListSection';
import styles from './SettingsCommon.module.css';

const JIMENG_MODEL_OPTIONS: SelectOption[] = [
  { value: 'jimeng-5.0', label: 'jimeng-5.0（国内站 / 亚洲国际站）' },
  { value: 'jimeng-4.6', label: 'jimeng-4.6（国内站 / 亚洲国际站）' },
  { value: 'jimeng-4.5', label: 'jimeng-4.5（默认，全站 · 2k/4k 全 ratio）' },
  { value: 'jimeng-4.1', label: 'jimeng-4.1（全站 · 2k/4k 全 ratio）' },
  { value: 'jimeng-4.0', label: 'jimeng-4.0（全站）' },
];

export function AIConfigTab() {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(null);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [enableThinking, setEnableThinking] = useState(true);
  const [jimengApiUrl, setJimengApiUrl] = useState('');
  const [jimengSessionId, setJimengSessionId] = useState('');
  const [jimengModel, setJimengModel] = useState('jimeng-4.5');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadAISettings().then((settings) => {
      setProviders(settings?.llmProviders ?? []);
      setDefaultProviderId(settings?.defaultProviderId ?? null);
      setDefaultModel(settings?.defaultModel ?? null);
      setEnableThinking(settings?.enableThinking ?? true);
      setJimengApiUrl(settings?.jimengApiUrl ?? 'http://47.109.159.194:8330');
      setJimengSessionId(settings?.jimengSessionId ?? '');
      setJimengModel(settings?.jimengModel ?? 'jimeng-4.5');
    });
  }, []);

  const handleSave = () => {
    void loadAISettings().then((current) => {
      void saveAISettings({
        ...(current ?? { minimaxApiKey: '', minimaxVoiceId: 'male-qn-qingse', minimaxSpeed: 1.0 }),
        // 多 Provider
        llmProviders: providers,
        defaultProviderId,
        defaultModel,
        // 旧字段保持兼容（取默认 Provider 的值回填）
        llmBaseUrl: providers.find((p) => p.id === defaultProviderId)?.baseUrl ?? current?.llmBaseUrl ?? '',
        llmApiKey: providers.find((p) => p.id === defaultProviderId)?.apiKey ?? current?.llmApiKey ?? '',
        llmModel: defaultModel ?? current?.llmModel ?? '',
        enableThinking,
        jimengApiUrl,
        jimengSessionId,
        jimengModel,
      }).then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      });
    });
  };

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
              setProviders(p);
              setDefaultProviderId(id);
            }}
          />
        </Field>

        <Field
          label="开启思考模式"
          hint="默认开启；关闭后会向兼容 OpenAI 的接口追加 enable_thinking=false"
        >
          <Switch checked={enableThinking} onChange={setEnableThinking} />
        </Field>

        <Divider label="封面生成（即梦）" />

        <Field label="即梦 API URL">
          <Input
            value={jimengApiUrl}
            onChange={(e) => setJimengApiUrl(e.target.value)}
            placeholder="http://47.109.159.194:8330"
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
        onClick={handleSave}
        saved={saved}
        defaultLabel="保存配置"
        className={styles.saveButton}
      />
    </>
  );
}
