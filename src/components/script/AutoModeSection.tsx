import type { AutoWorkflowParams } from '../../store/ai';
import { Field } from '../../ui';

export interface AutoModeOption {
  value: string;
  label: string;
}

export interface AutoModeSectionProps {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  params: AutoWorkflowParams;
  onChangeParams: (next: AutoWorkflowParams) => void;
  templateOptions: AutoModeOption[];
  roleOptions: AutoModeOption[];
  voiceOptions: AutoModeOption[];
}

export function AutoModeSection({
  enabled,
  onToggle,
  params,
  onChangeParams,
  templateOptions,
  roleOptions,
  voiceOptions,
}: AutoModeSectionProps) {
  const update = (patch: Partial<AutoWorkflowParams>) => {
    onChangeParams({ ...params, ...patch });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span>一键成稿（自动写稿、TTS、卡片、封面，跳过审稿）</span>
      </label>
      {enabled && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)' }}>
          <Field label="写稿模板">
            <select
              aria-label="写稿模板"
              value={params.templateId}
              onChange={(e) => update({ templateId: e.target.value })}
            >
              {templateOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="写稿角色">
            <select
              aria-label="写稿角色"
              value={params.roleId}
              onChange={(e) => update({ roleId: e.target.value })}
            >
              {roleOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="TTS 音色">
            <select
              aria-label="TTS 音色"
              value={params.voiceId}
              onChange={(e) => update({ voiceId: e.target.value })}
            >
              {voiceOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </div>
  );
}
