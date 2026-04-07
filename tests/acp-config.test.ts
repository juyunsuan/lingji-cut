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
    expect(data.agents).toEqual({});
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

  it('saves project session', async () => {
    const { AgentConfig } = await import('../electron/acp/config');
    const config = new AgentConfig(path.join(tmpDir, 'agent-config.json'));
    const projectDir = path.join(tmpDir, 'project');
    await fs.mkdir(projectDir, { recursive: true });

    await config.saveSession(projectDir, {
      sessionId: 'sess_abc',
      lastConnected: new Date().toISOString(),
    });

    const session = await config.loadSession(projectDir);
    expect(session?.sessionId).toBe('sess_abc');
  });

  it('returns null session for non-existent project', async () => {
    const { AgentConfig } = await import('../electron/acp/config');
    const config = new AgentConfig(path.join(tmpDir, 'agent-config.json'));
    const session = await config.loadSession('/non/existent');
    expect(session).toBeNull();
  });
});
