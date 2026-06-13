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
  getAgentPresentation,
  listAgentPresentations,
  DEFAULT_AGENT_ID,
} from '../../lib/agent-presentation';
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

const AGENT_PRESENTATIONS = listAgentPresentations();

const AGENT_ITEMS: PillGroupItem<string>[] = AGENT_PRESENTATIONS.map((presentation) => ({
  value: presentation.id,
  label: presentation.displayName,
}));

function makeDefaultEntry(agentId: string): AgentEntry {
  const profile = getAgentPresentation(agentId);
  return {
    enabled: profile.id === DEFAULT_AGENT_ID,
    authMode: 'custom_api',
    apiKey: '',
    apiBaseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-20250514',
    envText: '',
    configJson: '{}',
    version: profile.defaultVersion ?? '0.25.0',
    sortOrder: 0,
  };
}

export function AgentSettingsTab() {
  const [config, setConfig] = useState<AgentConfigData | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(DEFAULT_AGENT_ID);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [checks, setChecks] = useState<PreflightCheck[]>([]);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [uninstallDialogOpen, setUninstallDialogOpen] = useState(false);

  const profile = getAgentPresentation(selectedAgentId);
  const agent = config?.agents?.[selectedAgentId] ?? makeDefaultEntry(selectedAgentId);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.agentAPI === 'undefined') return;
    void loadConfig(DEFAULT_AGENT_ID);
    void runChecks(DEFAULT_AGENT_ID);
  }, []);

  const loadConfig = async (agentId: string) => {
    if (typeof window.agentAPI === 'undefined') return;
    const data = await window.agentAPI.getConfig();
    setConfig(data);
    const key = await window.agentAPI.getApiKey(agentId);
    setApiKey(key);
  };

  const runChecks = async (agentId: string) => {
    if (typeof window.agentAPI === 'undefined') return;
    setChecking(true);
    const results = await window.agentAPI.runPreflight(agentId);
    setChecks(results);
    setChecking(false);
  };

  const handleSelectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    setShowKey(false);
    if (typeof window.agentAPI === 'undefined') return;
    void window.agentAPI.getApiKey(agentId).then(setApiKey);
    void runChecks(agentId);
  }, []);

  const updateAgent = useCallback(
    (patch: Partial<AgentEntry>) => {
      if (!config) return;
      setConfig({
        ...config,
        agents: {
          ...config.agents,
          [selectedAgentId]: { ...agent, ...patch },
        },
      });
    },
    [agent, config, selectedAgentId],
  );

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    await window.agentAPI.saveConfig(config);
    // 仅托管型 agent（含 apiKeyEnvVar）才注入 API Key；pi 等无凭证代管。
    if (profile.apiKeyEnvVar && apiKey) {
      await window.agentAPI.setApiKey(selectedAgentId, apiKey);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleInstall = async () => {
    setBusyAction('install');
    await window.agentAPI.installAgent(agent.version);
    setBusyAction(null);
    await runChecks(selectedAgentId);
  };

  const handleUninstall = async () => {
    setBusyAction('uninstall');
    await window.agentAPI.uninstallAgent();
    setBusyAction(null);
    await runChecks(selectedAgentId);
  };

  if (!config) {
    return <div className={styles.loading}>加载中...</div>;
  }

  // pi 等非托管 agent 忽略 install fixAction（无 npm 托管），仅 managed 显示安装/升级动作。
  const allowInstallAction = profile.managed;

  return (
    <div className={styles.container}>
      <SettingsPageHeader
        title="AI Agent"
        description="ACP 适配器配置"
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

      <PillGroup<string>
        items={AGENT_ITEMS}
        value={selectedAgentId}
        size="sm"
        onChange={handleSelectAgent}
      />

      <section>
        <div className={styles.statusHeader}>
          <h3 className={styles.sectionTitle}>状态检查</h3>
          <Button.Icon
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => runChecks(selectedAgentId)}
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
              {allowInstallAction ? renderFixAction(check, busyAction, handleInstall) : null}
            </div>
          ))}
        </div>
      </section>

      {profile.managed ? (
        <>
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
        </>
      ) : (
        <>
          <Divider label="安装与凭证" />
          {profile.installGuide ? (
            <p className={styles.guideText}>{profile.installGuide}</p>
          ) : null}
          <p className={styles.guideText}>
            {profile.displayName} 的模型 provider 凭证在 {profile.requiredBinary ?? 'agent'} 侧配置，本应用不代管。
          </p>
        </>
      )}

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
        {profile.managed ? (
          <Button
            type="button"
            variant="destructive"
            leftIcon={<Trash2 size={14} />}
            onClick={() => setUninstallDialogOpen(true)}
            disabled={busyAction !== null}
          >
            {busyAction === 'uninstall' ? '卸载中...' : '卸载'}
          </Button>
        ) : null}
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
