import type { AgentModel, RuntimeAgentDef } from '../types';

/** 「跟随 CLI 配置」默认项，始终置顶。 */
const DEFAULT_MODEL_OPTION: AgentModel = { id: 'default', label: 'Default' };

/**
 * 解析 `codex debug models` 的 JSON 输出。
 *
 * 形如 `{ "models": [{ slug|id, display_name|name, visibility }] }`。
 * 纯函数：renderer 可安全 import（不触碰 Node API）。端口自 open-design
 * `apps/daemon/src/runtimes/defs/codex.ts` 的 parseCodexDebugModels。
 */
export function parseCodexDebugModels(stdout: string): AgentModel[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(stdout || ''));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const models = (parsed as { models?: unknown }).models;
  if (!Array.isArray(models)) return null;

  const out: AgentModel[] = [DEFAULT_MODEL_OPTION];
  const seen = new Set<string>([DEFAULT_MODEL_OPTION.id]);
  for (const raw of models) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as {
      slug?: unknown;
      id?: unknown;
      display_name?: unknown;
      name?: unknown;
      visibility?: unknown;
    };
    if (entry.visibility === 'hidden') continue;
    const id =
      typeof entry.slug === 'string'
        ? entry.slug.trim()
        : typeof entry.id === 'string'
          ? entry.id.trim()
          : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label =
      typeof entry.display_name === 'string' && entry.display_name.trim()
        ? entry.display_name.trim()
        : typeof entry.name === 'string' && entry.name.trim()
          ? entry.name.trim()
          : id;
    out.push({ id, label });
  }
  return out.length > 1 ? out : null;
}

/** 拉取失败 / 旧版 CLI 无 `debug models` 时的兜底列表（default + 常见模型）。 */
const CODEX_FALLBACK_MODELS: AgentModel[] = [
  DEFAULT_MODEL_OPTION,
  { id: 'gpt-5-codex', label: 'gpt-5-codex' },
  { id: 'gpt-5', label: 'gpt-5' },
  { id: 'o4-mini', label: 'o4-mini' },
  { id: 'o3', label: 'o3' },
  { id: 'gpt-4.1', label: 'gpt-4.1' },
  { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
];

// TODO: Verify Codex resume flag/shape against real binary. `codex exec` takes the
//       prompt as a trailing positional arg; resume is not wired here yet.
export const codexAgentDef = {
  id: 'codex',
  name: 'Codex',
  bin: 'codex',
  versionArgs: ['--version'],
  streamFormat: 'codex-json-event',
  defaultModel: 'default',
  // 静态展示列表（首屏 / 非 electron），与兜底一致。
  models: CODEX_FALLBACK_MODELS,
  // 动态拉取：`codex debug models` 输出 JSON 到 stdout（新版 CLI）。
  fallbackModels: CODEX_FALLBACK_MODELS,
  listModelsArgs: ['debug', 'models'],
  modelsOutputStream: 'stdout',
  parseModels: parseCodexDebugModels,
  // 思考程度：映射到 codex 的 model_reasoning_effort 配置项。
  defaultReasoning: 'default',
  reasoningOptions: [
    { id: 'default', label: '默认' },
    { id: 'minimal', label: '极简' },
    { id: 'low', label: '低' },
    { id: 'medium', label: '中' },
    { id: 'high', label: '高' },
  ],
  // `codex exec --json [--model <m>] [-c model_reasoning_effort=...] <prompt>`
  // prompt 必须为末尾位置参数；'default' 表示跟随 CLI 配置，不透传。
  buildArgs: (ctx) => [
    'exec',
    '--json',
    ...(ctx.model && ctx.model !== 'default' ? ['--model', ctx.model] : []),
    ...(ctx.reasoning && ctx.reasoning !== 'default'
      ? ['-c', `model_reasoning_effort="${ctx.reasoning}"`]
      : []),
    // 启用的内置 skill：codex 无 --skill，改用 --add-dir 让其可访问目录
    ...(ctx.skills ?? [])
      .filter((s) => s.enabled && s.status === 'available')
      .flatMap((s) => ['--add-dir', s.rootPath]),
    ctx.prompt,
  ],
} satisfies RuntimeAgentDef;
