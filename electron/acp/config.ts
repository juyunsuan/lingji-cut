import { safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AgentConfigData } from './types';

const DEFAULT_CONFIG: AgentConfigData = {
  agents: {},
  permissionPolicy: 'tiered',
};

export interface SessionData {
  sessionId: string;
  lastConnected: string;
}

export class AgentConfig {
  constructor(private configPath: string) {}

  async load(): Promise<AgentConfigData> {
    try {
      const raw = await fs.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AgentConfigData>;
      return {
        permissionPolicy: parsed.permissionPolicy ?? DEFAULT_CONFIG.permissionPolicy,
        agents: parsed.agents ?? {},
      };
    } catch {
      return { ...DEFAULT_CONFIG, agents: {} };
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

  async loadSession(projectDir: string): Promise<SessionData | null> {
    try {
      const raw = await fs.readFile(path.join(projectDir, 'agent-session.json'), 'utf-8');
      return JSON.parse(raw) as SessionData;
    } catch {
      return null;
    }
  }

  async saveSession(projectDir: string, data: SessionData): Promise<void> {
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, 'agent-session.json'),
      JSON.stringify(data, null, 2),
      'utf-8',
    );
  }

  private encryptedKeyPath(agentId: string): string {
    return path.join(path.dirname(this.configPath), `${agentId}.key`);
  }
}
