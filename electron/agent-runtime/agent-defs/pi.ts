import type { AgentModel, RuntimeAgentDef } from '../types';

/** 合成的「跟随 CLI 配置」默认项，始终置顶。 */
const DEFAULT_MODEL_OPTION: AgentModel = { id: 'default', label: 'Default' };

/**
 * 解析 `pi --list-models` 的表格输出（pi 打印到 stderr）。
 *
 * 输入形如：
 *   provider         model                  context  max-out  thinking  images
 *   anthropic        claude-sonnet-4-5      200K      64K      yes        yes
 *
 * 折叠为 `provider/model` 的 id，并在最前面补一个 default。
 * 纯函数：renderer 可安全 import（不触碰 Node API）。
 */
export function parsePiModels(raw: string): AgentModel[] | null {
  const lines = String(raw || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length === 0) return null;

  const entries: AgentModel[] = [DEFAULT_MODEL_OPTION];
  const seen = new Set<string>(['default']);

  // 第一行是表头，跳过。
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const provider = parts[0];
    const modelId = parts[1];
    if (provider === undefined || modelId === undefined) continue;
    const fullId = `${provider}/${modelId}`;
    if (seen.has(fullId)) continue;
    seen.add(fullId);
    entries.push({ id: fullId, label: fullId });
  }

  return entries.length > 1 ? entries : null;
}

/**
 * 拉取失败 / 超时 / 未安装 pi 时的兜底模型列表：default + 常见 provider 模型。
 * 也作为静态 `models`，保证下拉首屏不再只有 Default。
 */
const PI_FALLBACK_MODELS: AgentModel[] = [
  DEFAULT_MODEL_OPTION,
  { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (anthropic)' },
  { id: 'anthropic/claude-opus-4-5', label: 'Claude Opus 4.5 (anthropic)' },
  { id: 'openai/gpt-5', label: 'GPT-5 (openai)' },
  { id: 'openai/o4-mini', label: 'o4-mini (openai)' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (google)' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (google)' },
];

// TODO: Verify Pi CLI flags and rpc mode invocation against real binary
export const piAgentDef = {
  id: 'pi',
  name: 'Pi',
  bin: 'pi',
  versionArgs: ['--version'],
  streamFormat: 'pi-rpc',
  resumesSessionViaCli: true,
  defaultModel: 'default',
  // 静态展示列表（首屏 / 非 electron 环境），与兜底列表一致。
  models: PI_FALLBACK_MODELS,
  // 动态拉取元数据：`pi --list-models` 把表格打印到 stderr。
  fallbackModels: PI_FALLBACK_MODELS,
  listModelsArgs: ['--list-models'],
  modelsOutputStream: 'stderr',
  parseModels: parsePiModels,
  // 思考程度：映射到 pi 的 --thinking 档位。'default' 表示跟随 CLI 配置。
  defaultReasoning: 'default',
  reasoningOptions: [
    { id: 'default', label: '默认' },
    { id: 'off', label: '关闭' },
    { id: 'minimal', label: '极简' },
    { id: 'low', label: '低' },
    { id: 'medium', label: '中' },
    { id: 'high', label: '高' },
    { id: 'xhigh', label: '极高' },
  ],
  // pi --model 接受 "sonnet" / "anthropic/claude-sonnet-4-5" / "openai/gpt-5:high"
  // 等模式，原样透传即可；'default' 表示跟随 CLI 配置，不传 --model。
  buildArgs: (ctx) => {
    const args = ['--mode', 'rpc'];
    if (ctx.resumeSessionId) {
      args.push('--session', ctx.resumeSessionId);
    }
    if (ctx.model && ctx.model !== 'default') {
      args.push('--model', ctx.model);
    }
    if (ctx.reasoning && ctx.reasoning !== 'default') {
      args.push('--thinking', ctx.reasoning);
    }
    // 启用的内置 skill：pi 原生 --skill <path>（可重复）
    for (const skill of ctx.skills ?? []) {
      if (skill.enabled && skill.status === 'available') {
        args.push('--skill', skill.rootPath);
      }
    }
    return args;
  },
} satisfies RuntimeAgentDef;
