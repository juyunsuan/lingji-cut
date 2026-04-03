import { useEffect, useState } from 'react';
import type { AISettings } from '../types/ai';
import { Button, Field, Input, ModalShell } from '../ui/primitives';

interface AISettingsModalProps {
  visible: boolean;
  settings: AISettings | null;
  onClose: () => void;
  onSave: (settings: AISettings) => void;
}

export function AISettingsModal({
  visible,
  settings,
  onClose,
  onSave,
}: AISettingsModalProps) {
  const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [jimengApiUrl, setJimengApiUrl] = useState('');
  const [jimengSessionId, setJimengSessionId] = useState('');

  useEffect(() => {
    if (!visible) {
      return;
    }

    setLlmBaseUrl(settings?.llmBaseUrl ?? 'https://api.openai.com/v1');
    setLlmApiKey(settings?.llmApiKey ?? '');
    setLlmModel(settings?.llmModel ?? 'gpt-4o');
    setJimengApiUrl(settings?.jimengApiUrl ?? 'http://47.109.159.194:8330');
    setJimengSessionId(settings?.jimengSessionId ?? '');
  }, [settings, visible]);

  const canSave = Boolean(llmBaseUrl.trim() && llmApiKey.trim());

  return (
    <ModalShell
      visible={visible}
      eyebrow="SETTINGS"
      title="AI 配置"
      zIndex={120}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              if (!canSave) {
                return;
              }

              onSave({
                llmBaseUrl,
                llmApiKey,
                llmModel,
                jimengApiUrl,
                jimengSessionId,
              });
              onClose();
            }}
            disabled={!canSave}
          >
            保存
          </Button>
        </>
      }
    >
      <div style={formStyle}>
        <SettingsField
          label="LLM API Base URL"
          value={llmBaseUrl}
          placeholder="https://api.openai.com/v1"
          onChange={setLlmBaseUrl}
        />
        <SettingsField
          label="LLM API Key"
          value={llmApiKey}
          placeholder="sk-..."
          onChange={setLlmApiKey}
          type="password"
        />
        <SettingsField
          label="模型名称"
          value={llmModel}
          placeholder="gpt-4o"
          onChange={setLlmModel}
        />

        <div style={dividerBlockStyle}>
          <div style={sectionEyebrowStyle}>封面生成（即梦）</div>
        </div>

        <SettingsField
          label="即梦 API URL"
          value={jimengApiUrl}
          placeholder="http://47.109.159.194:8330"
          onChange={setJimengApiUrl}
        />
        <SettingsField
          label="即梦 Session ID"
          value={jimengSessionId}
          placeholder="session id"
          onChange={setJimengSessionId}
          type="password"
        />
      </div>
    </ModalShell>
  );
}

function SettingsField({
  label,
  value,
  placeholder,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <Field label={label}>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </Field>
  );
}

const formStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 16,
};

const dividerBlockStyle = {
  borderTop: '1px solid rgba(255,255,255,0.06)',
  paddingTop: 16,
  marginTop: 4,
};

const sectionEyebrowStyle = {
  fontSize: 12,
  letterSpacing: '0.12em',
  color: '#91a2bc',
};
