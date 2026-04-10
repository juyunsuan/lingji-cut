import { useState, useEffect, useCallback } from 'react';
import { Bot, Eye, EyeOff, RefreshCw, Loader2, Trash2 } from 'lucide-react';
import type {
  AgentConfigData,
  AgentEntry,
  AuthMode,
  PreflightCheck,
  PermissionPolicy,
} from '../../../electron/acp/types';
import { PillGroup } from '../../ui';
import type { PillGroupItem } from '../../ui/patterns/PillGroup';

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

  const agent = config?.agents?.['claude-acp'] ?? DEFAULT_AGENT_ENTRY;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.agentAPI === 'undefined') return;
    loadConfig();
    runChecks();
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
    [config, agent],
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
    if (!confirm('确认卸载 claude-agent-acp？')) return;
    setBusyAction('uninstall');
    await window.agentAPI.uninstallAgent();
    setBusyAction(null);
    await runChecks();
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'pass': return '✓';
      case 'fail': return '✗';
      case 'warn': return '⚠';
      default: return '...';
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'pass': return '#32D74B';
      case 'fail': return '#FF453A';
      case 'warn': return '#FFD60A';
      default: return '#EBEBF560';
    }
  };

  if (!config) return <div style={{ color: '#EBEBF550', padding: 20 }}>加载中...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Bot size={24} style={{ color: '#FF6B35' }} />
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Claude Code</h2>
          <p style={{ fontSize: 12, color: '#EBEBF560', margin: '2px 0 0' }}>
            ACP 适配器 · npx
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#EBEBF5' }}>
          <input
            type="checkbox"
            checked={agent.enabled}
            onChange={(e) => updateAgent({ enabled: e.target.checked })}
          />
          启用
        </label>
      </div>

      {/* 预检 */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>状态检查</span>
          <button
            type="button"
            onClick={runChecks}
            disabled={checking}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0A84FF', padding: 0 }}
          >
            <RefreshCw size={14} style={checking ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {checks.map((check, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: '#2C2C2E',
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              <span style={{ color: statusColor(check.status) }}>{statusIcon(check.status)}</span>
              <span style={{ fontWeight: 500, minWidth: 120 }}>{check.label}</span>
              <span style={{ flex: 1, color: '#EBEBF580' }}>{check.message}</span>
              {check.fixAction === 'install' && (
                <button
                  type="button"
                  onClick={handleInstall}
                  disabled={busyAction !== null}
                  style={{
                    background: '#0A84FF', color: '#fff', border: 'none',
                    borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
                  }}
                >
                  {busyAction === 'install' ? '安装中...' : '安装'}
                </button>
              )}
              {check.fixAction === 'upgrade' && (
                <button
                  type="button"
                  onClick={handleInstall}
                  disabled={busyAction !== null}
                  style={{
                    background: '#FFD60A', color: '#000', border: 'none',
                    borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
                  }}
                >
                  升级
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 分割线 */}
      <div style={{ borderTop: '1px solid #38383A', margin: '4px 0' }} />
      <span style={{ fontSize: 12, color: '#EBEBF560', marginTop: -16 }}>认证配置</span>

      {/* 认证方式 */}
      <PillGroup<AuthMode>
        items={AUTH_MODES}
        value={agent.authMode as AuthMode}
        size="sm"
        onChange={(mode) => updateAgent({ authMode: mode })}
      />

      {agent.authMode === 'custom_api' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#EBEBF580', marginBottom: 6 }}>API Key</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                style={{
                  flex: 1, background: '#2C2C2E', color: '#EBEBF5',
                  border: '1px solid #48484A', borderRadius: 8,
                  padding: '8px 12px', fontSize: 13, outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EBEBF560', padding: 4 }}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#EBEBF580', marginBottom: 6 }}>API Base URL</label>
            <input
              value={agent.apiBaseUrl}
              onChange={(e) => updateAgent({ apiBaseUrl: e.target.value })}
              placeholder="https://api.anthropic.com"
              style={{
                width: '100%', background: '#2C2C2E', color: '#EBEBF5',
                border: '1px solid #48484A', borderRadius: 8,
                padding: '8px 12px', fontSize: 13, outline: 'none',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#EBEBF580', marginBottom: 6 }}>Model</label>
            <input
              value={agent.model}
              onChange={(e) => updateAgent({ model: e.target.value })}
              placeholder="claude-sonnet-4-20250514"
              style={{
                width: '100%', background: '#2C2C2E', color: '#EBEBF5',
                border: '1px solid #48484A', borderRadius: 8,
                padding: '8px 12px', fontSize: 13, outline: 'none',
              }}
            />
          </div>
        </div>
      )}

      {/* 高级配置分割线 */}
      <div style={{ borderTop: '1px solid #38383A', margin: '4px 0' }} />
      <span style={{ fontSize: 12, color: '#EBEBF560', marginTop: -16 }}>高级配置</span>

      <div>
        <label style={{ display: 'block', fontSize: 12, color: '#EBEBF580', marginBottom: 6 }}>环境变量</label>
        <textarea
          value={agent.envText}
          onChange={(e) => updateAgent({ envText: e.target.value })}
          placeholder="KEY=VALUE（每行一条）"
          rows={4}
          style={{
            width: '100%', background: '#2C2C2E', color: '#EBEBF5',
            border: '1px solid #48484A', borderRadius: 8,
            padding: '8px 12px', fontSize: 12,
            fontFamily: 'SF Mono, Menlo, monospace', resize: 'vertical',
          }}
        />
      </div>

      {/* 权限策略分割线 */}
      <div style={{ borderTop: '1px solid #38383A', margin: '4px 0' }} />
      <span style={{ fontSize: 12, color: '#EBEBF560', marginTop: -16 }}>权限策略</span>

      <PillGroup<PermissionPolicy>
        items={PERMISSION_POLICIES}
        value={config.permissionPolicy}
        direction="vertical"
        fullWidth
        size="sm"
        onChange={(p) => {
          setConfig({ ...config, permissionPolicy: p });
          window.agentAPI?.setPermissionPolicy(p);
        }}
      />

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          type="button"
          onClick={handleUninstall}
          disabled={busyAction !== null}
          style={{
            padding: '10px 20px', borderRadius: 8,
            border: '1px solid #FF453A40', background: 'transparent',
            color: '#FF453A', fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <Trash2 size={14} />
          卸载
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '10px 24px', borderRadius: 8,
            border: 'none',
            background: saved ? '#32D74B' : '#0A84FF',
            color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {saved ? '已保存 ✓' : saving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  );
}
