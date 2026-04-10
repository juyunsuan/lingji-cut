import { useEffect, useState } from "react";
import type { AISettings } from "../types/ai";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Divider,
  Field,
  Input,
  ModalFooter,
  Select,
  Switch,
} from "../ui";
import type { SelectOption } from "../ui";
import styles from "./AISettingsModal.module.css";

const JIMENG_MODEL_OPTIONS: SelectOption[] = [
  { value: 'jimeng-5.0', label: 'jimeng-5.0（国内站 / 亚洲国际站）' },
  { value: 'jimeng-4.6', label: 'jimeng-4.6（国内站 / 亚洲国际站）' },
  { value: 'jimeng-4.5', label: 'jimeng-4.5（默认，全站 · 2k/4k 全 ratio）' },
  { value: 'jimeng-4.1', label: 'jimeng-4.1（全站 · 2k/4k 全 ratio）' },
  { value: 'jimeng-4.0', label: 'jimeng-4.0（全站）' },
];

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
  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [enableThinking, setEnableThinking] = useState(true);
  const [jimengApiUrl, setJimengApiUrl] = useState("");
  const [jimengSessionId, setJimengSessionId] = useState("");
  const [jimengModel, setJimengModel] = useState("jimeng-4.5");
  const [minimaxApiKey, setMinimaxApiKey] = useState("");
  const [minimaxVoiceId, setMinimaxVoiceId] = useState("male-qn-qingse");
  const [minimaxSpeed, setMinimaxSpeed] = useState("1.0");

  useEffect(() => {
    if (!visible) {
      return;
    }

    setLlmBaseUrl(settings?.llmBaseUrl ?? "https://api.openai.com/v1");
    setLlmApiKey(settings?.llmApiKey ?? "");
    setLlmModel(settings?.llmModel ?? "gpt-4o");
    setEnableThinking(settings?.enableThinking ?? true);
    setJimengApiUrl(settings?.jimengApiUrl ?? "http://47.109.159.194:8330");
    setJimengSessionId(settings?.jimengSessionId ?? "");
    setJimengModel(settings?.jimengModel ?? "jimeng-4.5");
    setMinimaxApiKey(settings?.minimaxApiKey ?? "");
    setMinimaxVoiceId(settings?.minimaxVoiceId ?? "male-qn-qingse");
    setMinimaxSpeed(String(settings?.minimaxSpeed ?? 1.0));
  }, [settings, visible]);

  const canSave = Boolean(llmBaseUrl.trim() && llmApiKey.trim());

  return (
    <Dialog open={visible} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className={styles.eyebrow}>SETTINGS</div>
          <DialogTitle>AI 配置</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className={styles.form}>
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

            <Field
              label="开启思考模式"
              hint="默认开启；关闭后会向兼容 OpenAI 的接口追加 extra_body.enable_thinking=false"
            >
              <Switch checked={enableThinking} onChange={setEnableThinking} />
            </Field>

            <Divider label="封面生成（即梦）" />

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
            <Field label="即梦模型">
              <Select
                value={jimengModel}
                options={JIMENG_MODEL_OPTIONS}
                onChange={(e) => setJimengModel(e.target.value)}
              />
            </Field>

            <Divider label="语音合成（MiniMax）" />
            <SettingsField
              label="MiniMax API Key"
              value={minimaxApiKey}
              placeholder="eyJ..."
              onChange={setMinimaxApiKey}
              type="password"
            />
            <SettingsField
              label="发音人 ID"
              value={minimaxVoiceId}
              placeholder="male-qn-qingse"
              onChange={setMinimaxVoiceId}
            />
            <SettingsField
              label="语速（0.5~2.0）"
              value={minimaxSpeed}
              placeholder="1.0"
              onChange={setMinimaxSpeed}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <ModalFooter
            onCancel={onClose}
            onConfirm={() => {
              if (!canSave) {
                return;
              }

              onSave({
                ...(settings ?? { minimaxApiKey: '', minimaxVoiceId: 'male-qn-qingse', minimaxSpeed: 1.0 }),
                llmBaseUrl,
                llmApiKey,
                llmModel,
                enableThinking,
                jimengApiUrl,
                jimengSessionId,
                jimengModel,
                minimaxApiKey,
                minimaxVoiceId,
                minimaxSpeed: parseFloat(minimaxSpeed) || 1.0,
              });
              onClose();
            }}
            confirmLabel="保存"
            confirmDisabled={!canSave}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsField({
  label,
  value,
  placeholder,
  onChange,
  type = "text",
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
