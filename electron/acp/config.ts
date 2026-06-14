import { safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AgentConfigData, AgentEntry } from './types';

/** 全局默认 agent id；无 activeAgentId 时回退到此。 */
export const DEFAULT_AGENT_ID = 'claude';

const DEFAULT_CONFIG: AgentConfigData = {
  agents: {},
  permissionPolicy: 'tiered',
  activeAgentId: DEFAULT_AGENT_ID,
};

/**
 * 旧 agent id → 新多协议 runtime id 的映射。
 * - 'claude-acp' → 'claude'
 * - 'pi-acp'     → 'pi'
 * - 其余原样返回；未知值由调用方决定回退。
 */
const LEGACY_ID_MAP: Record<string, string> = {
  'claude-acp': 'claude',
  'pi-acp': 'pi',
};

/**
 * 归一化 agent id：把旧 ACP 键映射到新多协议 runtime id（claude/codex/pi）。
 * 新键原样透传。
 */
export function normalizeAgentId(id: string | undefined | null): string {
  if (!id) return 'claude';
  return LEGACY_ID_MAP[id] ?? id;
}

/** 反查：给定新 id，返回对应的旧 ACP id（无则 null）。用于迁移期读旧凭证文件。 */
function legacyIdFor(newId: string): string | null {
  for (const [legacyId, mapped] of Object.entries(LEGACY_ID_MAP)) {
    if (mapped === newId) return legacyId;
  }
  return null;
}

function makeDefaultEntry(sortOrder: number): AgentEntry {
  return {
    enabled: false,
    authMode: 'subscription',
    apiKey: '',
    apiBaseUrl: '',
    model: '',
    envText: '',
    configJson: '',
    version: '',
    sortOrder,
  };
}

const CLAUDE_DEFAULT_ENTRY: AgentEntry = makeDefaultEntry(0);
const CODEX_DEFAULT_ENTRY: AgentEntry = makeDefaultEntry(1);
const PI_DEFAULT_ENTRY: AgentEntry = makeDefaultEntry(2);

/**
 * 确保 agents 记录中包含必需的默认条目（claude/codex/pi）。
 *
 * 兼容旧数据：若存在旧 'claude-acp' / 'pi-acp' 键，迁移其用户配置到新键
 * （'claude' / 'pi'），避免丢失用户已填的 apiKey/envText/model 等；新键已存在
 * 则不覆盖。迁移后移除旧键。
 *
 * 只在对应新 key 缺失时补入默认条目，不覆盖用户已有配置。
 */
export function ensureDefaultAgents(agents: Record<string, AgentEntry>): Record<string, AgentEntry> {
  const next: Record<string, AgentEntry> = { ...agents };

  // 旧键迁移：把旧条目搬到新键（仅当新键尚不存在，避免覆盖用户已迁移的新配置）
  for (const [legacyId, newId] of Object.entries(LEGACY_ID_MAP)) {
    if (next[legacyId]) {
      if (!next[newId]) {
        next[newId] = next[legacyId];
      }
      delete next[legacyId];
    }
  }

  return {
    claude: CLAUDE_DEFAULT_ENTRY,
    codex: CODEX_DEFAULT_ENTRY,
    pi: PI_DEFAULT_ENTRY,
    ...next,
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
        // 旧数据无 activeAgentId → 归一化后回退默认（不报错）
        activeAgentId: normalizeAgentId(parsed.activeAgentId ?? DEFAULT_AGENT_ID),
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
    const id = normalizeAgentId(agentId);
    // 先尝试新 id 的 key 文件；缺失时回退到旧 id（迁移期兼容）
    const direct = await this.readApiKeyFile(this.encryptedKeyPath(id));
    if (direct) return direct;
    const legacyId = legacyIdFor(id);
    if (legacyId) {
      const legacy = await this.readApiKeyFile(this.encryptedKeyPath(legacyId));
      if (legacy) return legacy;
    }
    return '';
  }

  private async readApiKeyFile(keyPath: string): Promise<string> {
    try {
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
    const keyPath = this.encryptedKeyPath(normalizeAgentId(agentId));
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
