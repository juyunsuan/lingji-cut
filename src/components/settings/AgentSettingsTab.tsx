import { useState, useEffect, useCallback } from 'react';
import { Bot, Eye, EyeOff, RefreshCw, Trash2 } from 'lucide-react';
import type {
  AgentConfigData,
  AgentEntry,
  AuthMode,
  PreflightCheck,
  PermissionPolicy,
} from '../../../electron/acp/types';
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Divider,
  Field,
  Input,
  PillGroup,
  SaveButton,
  SettingsPageHeader,
  Textarea,
} from '../../ui';
import type { PillGroupItem } from '../../ui/patterns/PillGroup';
import commonStyles from './SettingsCommon.module.css';
import styles from './AgentSettingsTab.module.css';

const AUTH_MODES: PillGroupItem<AuthMode>[] = [
  { value: 'subscription', label: '官方订阅 (Max/Pro)' },
  { value: 'custom_api', label: '自定义 API' },
];

const PERMISSION_POLICIES: PillGroupItem<PermissionPolicy>[] = [
  { value: 'auto_approve', label: '自动批准所有操作' },
  { value: 'tiered', label: '分级信任（读自动，写和终端需确认）' },
  { value: 'always_ask', label: '每次操作都需确认' },
];

const DEFAULT_AGENT_ENTRY = {
  enabled: true,
  authMode: 'custom_api' as const,
  apiKey: '',
  apiBaseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-20250514',
  envText: '',
  configJson: '{}',
  version: '0.25.0',
  sortOrder: 0,
};

export function AgentSettingsTab() {
  const [config, setConfig] = useState<AgentConfigData | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [checks, setChecks] = useState<PreflightCheck[]>([]);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [uninstallDialogOpen, setUninstallDialogOpen] = useState(false);

  const agent = config?.agents?.['claude-acp'] ?? DEFAULT_AGENT_ENTRY;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.agentAPI === 'undefined') return;
    void loadConfig();
    void runChecks();
  }, []);

  const loadConfig = async () => {
    if (typeof window.agentAPI === 'undefined') return;
    const data = await window.agentAPI.getConfig();
    setConfig(data);
    const key = await window.agentAPI.getApiKey('claude-acp');
    setApiKey(key);
  };

  const runChecks = async () => {
    if (typeof window.agentAPI === 'undefined') return;
    setChecking(true);
    const results = await window.agentAPI.runPreflight();
    setChecks(results);
    setChecking(false);
  };

  const updateAgent = useCallback(
    (patch: Partial<AgentEntry>) => {
      if (!config) return;
      setConfig({
        ...config,
        agents: {
          ...config.agents,
          'claude-acp': { ...agent, ...patch },
        },
      });
    },
    [agent, config],
  );

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    await window.agentAPI.saveConfig(config);
    if (apiKey) {
      await window.agentAPI.setApiKey('claude-acp', apiKey);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleInstall = async () => {
    setBusyAction('install');
    await window.agentAPI.installAgent(agent.version);
    setBusyAction(null);
    await runChecks();
  };

  const handleUninstall = async () => {
    setBusyAction('uninstall');
    await window.agentAPI.uninstallAgent();
    setBusyAction(null);
    await runChecks();
  };

  if (!config) {
    return <div className={styles.loading}>加载中...</div>;
  }

  return (
    <div className={styles.container}>
      <SettingsPageHeader
        title="Claude Code"
        description="ACP 适配器 · npx"
        leading={<Bot size={24} className={styles.agentIcon} />}
        actions={
          <Checkbox
            label="启用"
            checked={agent.enabled}
            onChange={(checked) => updateAgent({ enabled: checked })}
            size="sm"
          />
        }
      />

      <section>
        <div className={styles.statusHeader}>
          <h3 className={styles.sectionTitle}>状态检查</h3>
          <Button.Icon
            type="button"
            variant="ghost"
            size="sm"
            onClick={runChecks}
            disabled={checking}
            aria-label="刷新状态检查"
          >
            <RefreshCw size={14} className={checking ? styles.spinning : ''} />
          </Button.Icon>
        </div>

        <div className={styles.statusList}>
          {checks.map((check, index) => (
            <div key={`${check.label}-${index}`} className={styles.statusRow}>
              <Badge variant={getStatusVariant(check.status)}>{getStatusLabel(check.status)}</Badge>
              <span className={styles.statusLabel}>{check.label}</span>
              <span className={styles.statusMessage}>{check.message}</span>
              {renderFixAction(check, busyAction, handleInstall)}
            </div>
          ))}
        </div>
      </section>

      <Divider label="认证配置" />
      <PillGroup<AuthMode>
        items={AUTH_MODES}
        value={agent.authMode as AuthMode}
        size="sm"
        onChange={(mode) => updateAgent({ authMode: mode })}
      />

      {agent.authMode === 'custom_api' ? (
        <div className={commonStyles.formStack}>
          <Field label="API Key">
            <div className={styles.apiKeyRow}>
              <Input
                variant={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                size="sm"
                wrapperClassName={styles.apiKeyInput}
              />
              <Button.Icon
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowKey((state) => !state)}
                aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </Button.Icon>
            </div>
          </Field>

          <Field label="API Base URL">
            <Input
              value={agent.apiBaseUrl}
              onChange={(e) => updateAgent({ apiBaseUrl: e.target.value })}
              placeholder="https://api.anthropic.com"
              size="sm"
            />
          </Field>

          <Field label="Model">
            <Input
              value={agent.model}
              onChange={(e) => updateAgent({ model: e.target.value })}
              placeholder="claude-sonnet-4-20250514"
              size="sm"
            />
          </Field>
        </div>
      ) : null}

      <Divider label="高级配置" />
      <Field label="环境变量" hint="KEY=VALUE（每行一条）">
        <Textarea
          value={agent.envText}
          onChange={(e) => updateAgent({ envText: e.target.value })}
          placeholder="KEY=VALUE（每行一条）"
          rows={4}
          size="sm"
          resize="vertical"
          className={styles.editorMono}
        />
      </Field>

      <Divider label="权限策略" />
      <PillGroup<PermissionPolicy>
        items={PERMISSION_POLICIES}
        value={config.permissionPolicy}
        direction="vertical"
        fullWidth
        size="sm"
        onChange={(policy) => {
          setConfig({ ...config, permissionPolicy: policy });
          window.agentAPI?.setPermissionPolicy(policy);
        }}
      />

      <div className={styles.actionsRow}>
        <Button
          type="button"
          variant="destructive"
          leftIcon={<Trash2 size={14} />}
          onClick={() => setUninstallDialogOpen(true)}
          disabled={busyAction !== null}
        >
          {busyAction === 'uninstall' ? '卸载中...' : '卸载'}
        </Button>
        <div className={styles.actionsSpacer} />
        <SaveButton
          onClick={handleSave}
          saving={saving}
          saved={saved}
          disabled={busyAction !== null}
          defaultLabel="保存配置"
        />
      </div>

      <ConfirmDialog
        open={uninstallDialogOpen}
        onOpenChange={setUninstallDialogOpen}
        title="确认卸载 claude-agent-acp？"
        description="卸载后将移除当前 ACP 适配器，可稍后重新安装。"
        confirmText="确认卸载"
        confirmVariant="destructive"
        onConfirm={handleUninstall}
      />
    </div>
  );
}

function getStatusVariant(status: string): 'success' | 'warning' | 'destructive' | 'secondary' {
  switch (status) {
    case 'pass':
      return 'success';
    case 'fail':
      return 'destructive';
    case 'warn':
      return 'warning';
    default:
      return 'secondary';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pass':
      return '通过';
    case 'fail':
      return '失败';
    case 'warn':
      return '警告';
    default:
      return '检查中';
  }
}

function renderFixAction(
  check: PreflightCheck,
  busyAction: string | null,
  onInstall: () => Promise<void>,
) {
  if (check.fixAction !== 'install' && check.fixAction !== 'upgrade') {
    return null;
  }

  const isBusy = busyAction !== null;
  const variant = check.fixAction === 'upgrade' ? 'warning' : 'primary';
  const label = isBusy ? '处理中...' : check.fixAction === 'upgrade' ? '升级' : '安装';

  return (
    <Button type="button" size="sm" variant={variant} disabled={isBusy} onClick={onInstall}>
      {label}
    </Button>
  );
}
