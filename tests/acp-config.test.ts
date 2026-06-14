import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(`enc:${text}`),
    decryptString: (buffer: Buffer) => buffer.toString().replace('enc:', ''),
  },
}));

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-config-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('AgentConfig', () => {
  it('returns default config when file does not exist', async () => {
    const { AgentConfig } = await import('../electron/acp/config');
    const config = new AgentConfig(path.join(tmpDir, 'agent-config.json'));
    const data = await config.load();
    expect(data.permissionPolicy).toBe('tiered');
    // 缺失文件时仍应包含默认的多协议条目 claude/codex/pi
    expect(data.agents.claude).toBeDefined();
    expect(data.agents.codex).toBeDefined();
    expect(data.agents.pi).toBeDefined();
  });

  it('saves and loads agent config', async () => {
    const { AgentConfig } = await import('../electron/acp/config');
    const config = new AgentConfig(path.join(tmpDir, 'agent-config.json'));
    await config.save({
      permissionPolicy: 'always_ask',
      agents: {
        claude: {
          enabled: true,
          authMode: 'custom_api',
          apiKey: '',
          apiBaseUrl: 'https://api.anthropic.com',
          model: 'claude-sonnet-4-20250514',
          envText: '',
          configJson: '{}',
          version: '0.25.0',
          sortOrder: 0,
        },
      },
    });

    const loaded = await config.load();
    expect(loaded.permissionPolicy).toBe('always_ask');
    expect(loaded.agents.claude.model).toBe('claude-sonnet-4-20250514');
  });

  it('defaults activeAgentId to claude when missing on disk', async () => {
    const { AgentConfig } = await import('../electron/acp/config');
    const config = new AgentConfig(path.join(tmpDir, 'agent-config.json'));
    // 缺失文件 → 默认激活 claude
    const fresh = await config.load();
    expect(fresh.activeAgentId).toBe('claude');

    // 旧数据（无 activeAgentId 字段）→ 回退默认，不报错
    const configPath = path.join(tmpDir, 'legacy.json');
    await fs.writeFile(
      configPath,
      JSON.stringify({ permissionPolicy: 'tiered', agents: {} }),
      'utf-8',
    );
    const legacy = new AgentConfig(configPath);
    const loaded = await legacy.load();
    expect(loaded.activeAgentId).toBe('claude');
  });

  it('persists and reloads activeAgentId (global single active)', async () => {
    const { AgentConfig } = await import('../electron/acp/config');
    const config = new AgentConfig(path.join(tmpDir, 'agent-config.json'));
    await config.save({
      permissionPolicy: 'tiered',
      activeAgentId: 'codex',
      agents: {},
    });
    const loaded = await config.load();
    expect(loaded.activeAgentId).toBe('codex');
  });

  it('normalizes legacy activeAgentId on load', async () => {
    const { AgentConfig } = await import('../electron/acp/config');
    const configPath = path.join(tmpDir, 'legacy-active.json');
    await fs.writeFile(
      configPath,
      JSON.stringify({ permissionPolicy: 'tiered', agents: {}, activeAgentId: 'claude-acp' }),
      'utf-8',
    );
    const config = new AgentConfig(configPath);
    const loaded = await config.load();
    expect(loaded.activeAgentId).toBe('claude');
  });

  it('encrypts and decrypts API key', async () => {
    const { AgentConfig } = await import('../electron/acp/config');
    const config = new AgentConfig(path.join(tmpDir, 'agent-config.json'));
    await config.setApiKey('claude', 'sk-ant-test-key-123');
    const key = await config.getApiKey('claude');
    expect(key).toBe('sk-ant-test-key-123');
  });

  it('getApiKey 接受旧键 claude-acp 并归一化到 claude', async () => {
    const { AgentConfig } = await import('../electron/acp/config');
    const config = new AgentConfig(path.join(tmpDir, 'agent-config.json'));
    await config.setApiKey('claude', 'sk-new-key');
    // 用旧键查询，应归一化后读到同一个 key 文件
    const key = await config.getApiKey('claude-acp');
    expect(key).toBe('sk-new-key');
  });
});

describe('normalizeAgentId', () => {
  it('maps legacy ids to new runtime ids', async () => {
    const { normalizeAgentId } = await import('../electron/acp/config');
    expect(normalizeAgentId('claude-acp')).toBe('claude');
    expect(normalizeAgentId('pi-acp')).toBe('pi');
    expect(normalizeAgentId('codex')).toBe('codex');
    expect(normalizeAgentId('claude')).toBe('claude');
    expect(normalizeAgentId(undefined)).toBe('claude');
    expect(normalizeAgentId('unknown-xyz')).toBe('unknown-xyz');
  });
});

describe('ensureDefaultAgents', () => {
  it('injects claude/codex/pi default entries when missing', async () => {
    const { ensureDefaultAgents } = await import('../electron/acp/config');
    const result = ensureDefaultAgents({});
    expect(result.claude).toBeDefined();
    expect(result.claude.enabled).toBe(false);
    expect(result.claude.sortOrder).toBe(0);
    expect(result.codex).toBeDefined();
    expect(result.codex.sortOrder).toBe(1);
    expect(result.pi).toBeDefined();
    expect(result.pi.sortOrder).toBe(2);
  });

  it('does not overwrite existing pi user config', async () => {
    const { ensureDefaultAgents } = await import('../electron/acp/config');
    const userPi = {
      enabled: true,
      authMode: 'custom_api' as const,
      apiKey: 'user-key',
      apiBaseUrl: 'https://pi.example.com',
      model: 'pi-model',
      envText: 'FOO=bar',
      configJson: '{"x":1}',
      version: '1.0.0',
      sortOrder: 5,
    };
    const result = ensureDefaultAgents({ pi: userPi });
    expect(result.pi).toEqual(userPi);
  });

  it('does not overwrite existing claude user config', async () => {
    const { ensureDefaultAgents } = await import('../electron/acp/config');
    const userClaude = {
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
    const result = ensureDefaultAgents({ claude: userClaude });
    expect(result.claude).toEqual(userClaude);
  });

  it('migrates legacy claude-acp/pi-acp config to new keys and drops legacy keys', async () => {
    const { ensureDefaultAgents } = await import('../electron/acp/config');
    const legacyClaude = {
      enabled: true,
      authMode: 'custom_api' as const,
      apiKey: 'legacy-claude-key',
      apiBaseUrl: 'https://legacy.anthropic.com',
      model: 'claude-legacy',
      envText: 'X=1',
      configJson: '',
      version: '0.20.0',
      sortOrder: 9,
    };
    const legacyPi = {
      enabled: true,
      authMode: 'subscription' as const,
      apiKey: '',
      apiBaseUrl: '',
      model: 'pi-legacy',
      envText: '',
      configJson: '',
      version: '',
      sortOrder: 7,
    };
    const result = ensureDefaultAgents({
      'claude-acp': legacyClaude,
      'pi-acp': legacyPi,
    });
    // 旧键已迁移到新键，用户配置保留
    expect(result.claude).toEqual(legacyClaude);
    expect(result.pi).toEqual(legacyPi);
    // 旧键被移除
    expect(result['claude-acp']).toBeUndefined();
    expect(result['pi-acp']).toBeUndefined();
    // codex 默认补入
    expect(result.codex).toBeDefined();
  });

  it('does not overwrite new key when both legacy and new exist', async () => {
    const { ensureDefaultAgents } = await import('../electron/acp/config');
    const legacyClaude = { ...EMPTY_ENTRY, model: 'from-legacy', sortOrder: 0 };
    const newClaude = { ...EMPTY_ENTRY, model: 'from-new', sortOrder: 0 };
    const result = ensureDefaultAgents({
      'claude-acp': legacyClaude,
      claude: newClaude,
    });
    expect(result.claude.model).toBe('from-new');
    expect(result['claude-acp']).toBeUndefined();
  });

  it('load() returns pi with enabled=false and sortOrder=2 for new config', async () => {
    const { AgentConfig } = await import('../electron/acp/config');
    const config = new AgentConfig(path.join(tmpDir, 'agent-config.json'));
    const data = await config.load();
    expect(data.agents.pi.enabled).toBe(false);
    expect(data.agents.pi.sortOrder).toBe(2);
  });

  it('load() preserves user-modified claude after save/load roundtrip', async () => {
    const { AgentConfig } = await import('../electron/acp/config');
    const config = new AgentConfig(path.join(tmpDir, 'agent-config.json'));
    const customClaude = {
      enabled: true,
      authMode: 'custom_api' as const,
      apiKey: '',
      apiBaseUrl: 'https://custom.anthropic.com',
      model: 'claude-opus-4',
      envText: '',
      configJson: '',
      version: '0.26.0',
      sortOrder: 0,
    };
    await config.save({
      permissionPolicy: 'tiered',
      agents: { claude: customClaude },
    });
    const loaded = await config.load();
    // 用户修改的 claude 必须完整保留，不被默认值覆盖
    expect(loaded.agents.claude).toEqual(customClaude);
  });

  it('load() migrates legacy on-disk config to new keys', async () => {
    const { AgentConfig } = await import('../electron/acp/config');
    const configPath = path.join(tmpDir, 'agent-config.json');
    await fs.writeFile(
      configPath,
      JSON.stringify({
        permissionPolicy: 'tiered',
        agents: { 'claude-acp': { ...EMPTY_ENTRY, model: 'legacy-on-disk' } },
      }),
      'utf-8',
    );
    const config = new AgentConfig(configPath);
    const loaded = await config.load();
    expect(loaded.agents.claude.model).toBe('legacy-on-disk');
    expect(loaded.agents['claude-acp']).toBeUndefined();
  });
});

const EMPTY_ENTRY = {
  enabled: false,
  authMode: 'subscription' as const,
  apiKey: '',
  apiBaseUrl: '',
  model: '',
  envText: '',
  configJson: '',
  version: '',
  sortOrder: 0,
};
