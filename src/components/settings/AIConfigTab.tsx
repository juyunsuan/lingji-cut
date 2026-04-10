import { useState, useEffect } from 'react';
import { loadAISettings, saveAISettings } from '../../store/ai';
import { Field, Input, Divider, Switch } from '../../ui';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o';

export function AIConfigTab() {
  const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [enableThinking, setEnableThinking] = useState(true);
  const [jimengApiUrl, setJimengApiUrl] = useState('');
  const [jimengSessionId, setJimengSessionId] = useState('');
  const [minimaxApiKey, setMinimaxApiKey] = useState('');
  const [minimaxGroupId, setMinimaxGroupId] = useState('');
  const [minimaxVoiceId, setMinimaxVoiceId] = useState('male-qn-qingse');
  const [minimaxSpeed, setMinimaxSpeed] = useState(1.0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const settings = loadAISettings();
    setLlmBaseUrl(settings?.llmBaseUrl ?? 'https://api.openai.com/v1');
    setLlmApiKey(settings?.llmApiKey ?? '');
    setLlmModel(settings?.llmModel ?? 'gpt-4o');
    setEnableThinking(settings?.enableThinking ?? true);
    setJimengApiUrl(settings?.jimengApiUrl ?? 'http://47.109.159.194:8330');
    setJimengSessionId(settings?.jimengSessionId ?? '');
    setMinimaxApiKey(settings?.minimaxApiKey ?? '');
    setMinimaxGroupId(settings?.minimaxGroupId ?? '');
    setMinimaxVoiceId(settings?.minimaxVoiceId ?? 'male-qn-qingse');
    setMinimaxSpeed(settings?.minimaxSpeed ?? 1.0);
  }, []);

  const handleSave = () => {
    saveAISettings({
      llmBaseUrl,
      llmApiKey,
      llmModel,
      enableThinking,
      jimengApiUrl,
      jimengSessionId,
      minimaxApiKey,
      minimaxGroupId,
      minimaxVoiceId,
      minimaxSpeed,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>AI 基础配置</h2>
        <p style={{ fontSize: 13, color: '#EBEBF599', margin: '8px 0 0' }}>
          配置 OpenAI 兼容接口与即梦图片生成服务
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="API Base URL">
          <Input
            value={llmBaseUrl}
            onChange={(e) => setLlmBaseUrl(e.target.value)}
            placeholder={DEFAULT_OPENAI_BASE_URL}
          />
        </Field>
        <Field label="API Key">
          <Input type="password" value={llmApiKey} onChange={(e) => setLlmApiKey(e.target.value)} placeholder="sk-..." />
        </Field>
        <Field label="模型名称">
          <Input
            value={llmModel}
            onChange={(e) => setLlmModel(e.target.value)}
            placeholder={DEFAULT_OPENAI_MODEL}
          />
        </Field>

        <Field
          label="开启思考模式"
          hint="默认开启；关闭后会向兼容 OpenAI 的接口追加 extra_body.enable_thinking=false"
        >
          <Switch checked={enableThinking} onChange={setEnableThinking} />
        </Field>

        <Divider label="封面生成（即梦）" />

        <Field label="即梦 API URL">
          <Input value={jimengApiUrl} onChange={(e) => setJimengApiUrl(e.target.value)} placeholder="http://47.109.159.194:8330" />
        </Field>
        <Field label="即梦 Session ID">
          <Input type="password" value={jimengSessionId} onChange={(e) => setJimengSessionId(e.target.value)} placeholder="session id" />
        </Field>
      </div>

      <button
        type="button"
        onClick={handleSave}
        style={{
          alignSelf: 'flex-start',
          padding: '10px 24px',
          borderRadius: 8,
          border: 'none',
          background: saved ? '#32D74B' : '#0A84FF',
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {saved ? '已保存 ✓' : '保存配置'}
      </button>
    </>
  );
}
