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
} from "../ui";
import styles from "./AISettingsModal.module.css";

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
  const [jimengApiUrl, setJimengApiUrl] = useState("");
  const [jimengSessionId, setJimengSessionId] = useState("");

  useEffect(() => {
    if (!visible) {
      return;
    }

    setLlmBaseUrl(settings?.llmBaseUrl ?? "https://api.openai.com/v1");
    setLlmApiKey(settings?.llmApiKey ?? "");
    setLlmModel(settings?.llmModel ?? "gpt-4o");
    setJimengApiUrl(settings?.jimengApiUrl ?? "http://47.109.159.194:8330");
    setJimengSessionId(settings?.jimengSessionId ?? "");
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
                llmBaseUrl,
                llmApiKey,
                llmModel,
                jimengApiUrl,
                jimengSessionId,
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
