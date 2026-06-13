import { safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AgentConfigData, AgentEntry } from './types';

const DEFAULT_CONFIG: AgentConfigData = {
  agents: {},
  permissionPolicy: 'tiered',
};

const CLAUDE_ACP_DEFAULT_ENTRY: AgentEntry = {
  enabled: false,
  authMode: 'subscription',
  apiKey: '',
  apiBaseUrl: '',
  model: '',
  envText: '',
  configJson: '',
  version: '',
  sortOrder: 0,
};

const PI_ACP_DEFAULT_ENTRY: AgentEntry = {
  enabled: false,
  authMode: 'subscription',
  apiKey: '',
  apiBaseUrl: '',
  model: '',
  envText: '',
  configJson: '',
  version: '',
  sortOrder: 1,
};

/**
 * 确保 agents 记录中包含必需的默认条目（claude-acp、pi-acp）。
 * 只在对应 key 缺失时补入，不覆盖用户已有配置。
 */
export function ensureDefaultAgents(agents: Record<string, AgentEntry>): Record<string, AgentEntry> {
  return {
    'claude-acp': CLAUDE_ACP_DEFAULT_ENTRY,
    'pi-acp': PI_ACP_DEFAULT_ENTRY,
    ...agents,
  };
}

export class AgentConfig {
  constructor(private configPath: string) {}

  async load(): Promise<AgentConfigData> {
    try {
      const raw = await fs.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AgentConfigData>;
      return {
        permissionPolicy: parsed.permissionPolicy ?? DEFAULT_CONFIG.permissionPolicy,
        agents: ensureDefaultAgents(parsed.agents ?? {}),
      };
    } catch {
      return {
        ...DEFAULT_CONFIG,
        agents: ensureDefaultAgents({}),
      };
    }
  }

  async save(data: AgentConfigData): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async getApiKey(agentId: string): Promise<string> {
    try {
      const keyPath = this.encryptedKeyPath(agentId);
      const buffer = await fs.readFile(keyPath);
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(buffer);
      }
      return buffer.toString('utf-8');
    } catch {
      return '';
    }
  }

  async setApiKey(agentId: string, key: string): Promise<void> {
    const keyPath = this.encryptedKeyPath(agentId);
    await fs.mkdir(path.dirname(keyPath), { recursive: true });
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(key);
      await fs.writeFile(keyPath, encrypted);
    } else {
      await fs.writeFile(keyPath, key, 'utf-8');
    }
  }

  private encryptedKeyPath(agentId: string): string {
    return path.join(path.dirname(this.configPath), `${agentId}.key`);
  }
}
