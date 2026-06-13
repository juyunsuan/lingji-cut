/**
 * agent-presentation.ts
 *
 * Renderer 侧 agent 展示元数据。
 *
 * 底层已切到多协议 runtime（新 id：claude/codex/pi），agent 列表 / 名称从
 * `electron/agent-runtime/registry` 的 `listAgentDefs()` 取（纯数据，renderer 可安全 import）。
 *
 * 设置页除了 id/name 还需要一些「展示 / 安装策略」字段（是否托管、是否需要 API Key、
 * 安装指引等），这些不在 `RuntimeAgentDef` 上。这里按新 id 维护一份 renderer 镜像常量，
 * 与 runtime def 合并成 `AgentPresentation`。
 *
 * 注意：这是 A11 的最小适配。完整的 agent UI 重构（AgentPicker / ChatPane 等）属于子项目 B；
 * 届时统一收敛展示元数据来源。
 */

import { listAgentDefs } from '../../electron/agent-runtime/registry';

/** 默认 agent id（claude）。旧 'claude-acp' 由 ipc/config 的 normalizeAgentId 兼容。 */
export const DEFAULT_AGENT_ID = 'claude';

/** Renderer 侧 agent 展示 / 安装策略元数据（不在 RuntimeAgentDef 上的部分）。 */
interface AgentUiMeta {
  /** 是否由本应用托管安装（仅 claude 走 npm 托管的 ACP 适配器）。 */
  managed: boolean;
  /** 需要注入的 API Key env 变量名；无则不显示凭证表单、不注入 key。 */
  apiKeyEnvVar?: string;
  /** 非托管 agent 所需的外部二进制名（用于展示提示）。 */
  requiredBinary?: string;
  /** 非托管 agent 的安装 / 凭证配置指引文案。 */
  installGuide?: string;
  /** 托管 agent 的默认版本（安装动作使用）。 */
  defaultVersion?: string;
}

/** 按新 id 维护的展示元数据镜像。 */
const AGENT_UI_META: Record<string, AgentUiMeta> = {
  claude: {
    managed: true,
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    defaultVersion: '0.25.0',
  },
  codex: {
    managed: false,
    requiredBinary: 'codex',
    installGuide:
      'Codex 通过本地 `codex` CLI 启动，需先在系统安装 `codex` 命令并完成登录 / 凭证配置。本应用不代管 codex 安装与凭证。',
  },
  pi: {
    managed: false,
    requiredBinary: 'pi',
    installGuide:
      'Pi 通过本地 `pi` CLI 启动，需先在系统安装 `pi` 命令并配置好模型 provider 凭证（见 https://pi.dev）。本应用不代管 pi 安装与凭证。',
  },
};

const DEFAULT_UI_META: AgentUiMeta = { managed: false };

export interface AgentPresentation extends AgentUiMeta {
  id: string;
  displayName: string;
}

function uiMetaFor(id: string): AgentUiMeta {
  return AGENT_UI_META[id] ?? DEFAULT_UI_META;
}

/** 列出所有 agent 的展示元数据（id / 名称来自 runtime registry）。 */
export function listAgentPresentations(): AgentPresentation[] {
  return listAgentDefs().map((def) => ({
    id: def.id,
    displayName: def.name,
    ...uiMetaFor(def.id),
  }));
}

/** 取单个 agent 的展示元数据；未知 id 回退到默认 agent（claude）。 */
export function getAgentPresentation(id: string | undefined | null): AgentPresentation {
  const defs = listAgentDefs();
  const def = (id ? defs.find((d) => d.id === id) : null) ?? defs.find((d) => d.id === DEFAULT_AGENT_ID) ?? defs[0];
  return {
    id: def.id,
    displayName: def.name,
    ...uiMetaFor(def.id),
  };
}
