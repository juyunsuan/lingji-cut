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
    // 缺失文件时仍应包含默认的 claude-acp 和 pi-acp 条目
    expect(data.agents['claude-acp']).toBeDefined();
    expect(data.agents['pi-acp']).toBeDefined();
  });

  it('saves and loads agent config', async () => {
    const { AgentConfig } = await import('../electron/acp/config');
    const config = new AgentConfig(path.join(tmpDir, 'agent-config.json'));
    await config.save({
      permissionPolicy: 'always_ask',
      agents: {
        'claude-acp': {
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
    expect(loaded.agents['claude-acp'].model).toBe('claude-sonnet-4-20250514');
  });

  it('encrypts and decrypts API key', async () => {
    const { AgentConfig } = await import('../electron/acp/config');
    const config = new AgentConfig(path.join(tmpDir, 'agent-config.json'));
    await config.setApiKey('claude-acp', 'sk-ant-test-key-123');
    const key = await config.getApiKey('claude-acp');
    expect(key).toBe('sk-ant-test-key-123');
  });
});

describe('ensureDefaultAgents', () => {
  it('injects pi-acp default entry when missing', async () => {
    const { ensureDefaultAgents } = await import('../electron/acp/config');
    const result = ensureDefaultAgents({});
    expect(result['pi-acp']).toBeDefined();
    expect(result['pi-acp'].enabled).toBe(false);
    expect(result['pi-acp'].sortOrder).toBe(1);
  });

  it('injects claude-acp default entry when missing', async () => {
    const { ensureDefaultAgents } = await import('../electron/acp/config');
    const result = ensureDefaultAgents({});
    expect(result['claude-acp']).toBeDefined();
    expect(result['claude-acp'].enabled).toBe(false);
    expect(result['claude-acp'].sortOrder).toBe(0);
  });

  it('does not overwrite existing pi-acp user config', async () => {
    const { ensureDefaultAgents } = await import('../electron/acp/config');
    const userPiAcp = {
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
    const result = ensureDefaultAgents({ 'pi-acp': userPiAcp });
    expect(result['pi-acp']).toEqual(userPiAcp);
  });

  it('does not overwrite existing claude-acp user config', async () => {
    const { ensureDefaultAgents } = await import('../electron/acp/config');
    const userClaudeAcp = {
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
    const result = ensureDefaultAgents({ 'claude-acp': userClaudeAcp });
    expect(result['claude-acp']).toEqual(userClaudeAcp);
  });

  it('load() returns pi-acp with enabled=false and sortOrder=1 for new config', async () => {
    const { AgentConfig } = await import('../electron/acp/config');
    const config = new AgentConfig(path.join(tmpDir, 'agent-config.json'));
    const data = await config.load();
    expect(data.agents['pi-acp'].enabled).toBe(false);
    expect(data.agents['pi-acp'].sortOrder).toBe(1);
  });

  it('load() preserves user-modified claude-acp after save/load roundtrip', async () => {
    const { AgentConfig } = await import('../electron/acp/config');
    const config = new AgentConfig(path.join(tmpDir, 'agent-config.json'));
    const customClaudeAcp = {
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
      agents: { 'claude-acp': customClaudeAcp },
    });
    const loaded = await config.load();
    // 用户修改的 claude-acp 必须完整保留，不被默认值覆盖
    expect(loaded.agents['claude-acp']).toEqual(customClaudeAcp);
  });
});
