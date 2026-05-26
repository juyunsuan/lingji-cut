import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { AISettings, LLMProvider } from '../../types/ai';
import type { ResolvedBinding } from './binding-resolver';
import {
  extractReasoningContent,
  extractTextContent,
  parseLLMJsonResponse,
  parseStructuredOutput,
} from './content';
import { createChatModel, createChatModelFromProvider } from './model';

export interface StreamCallbacks {
  onReasoningChunk?: (chunk: string) => void;
}

export { parseLLMJsonResponse };

function buildPromptMessages(systemPrompt: string, userMessage: string) {
  return [new SystemMessage(systemPrompt), new HumanMessage(userMessage)];
}

function assertNonEmptyContent(content: string, message: string): string {
  if (!content) {
    throw new Error(message);
  }

  return content;
}

function pickModel(settings: AISettings, binding?: ResolvedBinding) {
  if (binding) {
    // provider.enableThinking 缺省时由 createChatModelFromProvider 内部默认 true
    return createChatModelFromProvider(binding.provider, binding.model);
  }
  return createChatModel(settings);
}

// 流式调用下不再用"总时长"做超时——只要 chunk（含 thinking 的 reasoning）
// 持续到达，就认为模型还在工作。idle 即"两个 chunk 之间最长允许的间隔"。
const STRUCTURED_IDLE_TIMEOUT_MS = 120_000;
const STRUCTURED_THINKING_IDLE_TIMEOUT_MS = 240_000;
// 总硬上限，仅作失控保护（流真的不结束时兜底）
const STRUCTURED_HARD_TIMEOUT_MS = 30 * 60_000;
const STRUCTURED_MAX_RETRIES = 1;
const STRUCTURED_RETRY_HINT =
  '\n\n【重要】上一次返回的不是合法 JSON 对象。请严格只输出一个完整的 JSON 对象，不要包裹 markdown 代码块、不要追加任何解释文字、不要省略闭合花括号。';

export interface StructuredDataOptions {
  // 可选：调用方可指定标签，用于错误信息定位（如 "cards.segment#3/12"）
  label?: string;
  // 可选：覆盖 idle 超时
  idleTimeoutMs?: number;
  // 可选：覆盖总硬上限
  hardTimeoutMs?: number;
  /** 可选：观测 hook（lib 层不直接依赖 electron，main 侧显式注入） */
  telemetry?: import('../telemetry/auto-run').TelemetryHook;
}

function isThinkingBinding(binding?: ResolvedBinding): boolean {
  if (!binding) return false;
  // provider.enableThinking 缺省视为 true（与 createChatModelFromProvider 保持一致）
  if (binding.provider.enableThinking === false) return false;
  // 或者模型名带常见 thinking 标识也视为 thinking
  const m = (binding.model || '').toLowerCase();
  return (
    binding.provider.enableThinking === true ||
    /(reason|think|r1|o1|o3|o4|qwq)/.test(m)
  );
}

interface StreamableModel {
  stream: (messages: unknown[]) => Promise<AsyncIterable<unknown>>;
  invoke?: (messages: unknown[]) => Promise<{ content: unknown }>;
}

interface BindableModel {
  bind?: (kwargs: Record<string, unknown>) => StreamableModel;
}

// 流式收集：每个 chunk 到达即重置 idle 计时；任意计时器触发就 abort 整体流
async function streamCollectWithIdleTimeout(
  model: StreamableModel,
  messages: unknown[],
  opts: {
    idleTimeoutMs: number;
    hardTimeoutMs: number;
    label: string;
    onFirstChunk?: (latencyMs: number) => void;
  },
): Promise<string> {
  const { idleTimeoutMs, hardTimeoutMs, label, onFirstChunk } = opts;
  let fullText = '';
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let hardTimer: ReturnType<typeof setTimeout> | undefined;
  let timeoutError: Error | null = null;
  const startTs = Date.now();
  let firstChunkSeen = false;

  const stream = await model.stream(messages);
  // 用 Async Iterator 接口拿到 return() 句柄，超时时主动关闭
  const iterator = (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]();

  const cleanup = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (hardTimer) clearTimeout(hardTimer);
  };

  const abort = (err: Error) => {
    timeoutError = err;
    // 主动关闭底层流，迭代会以 done 退出
    if (typeof iterator.return === 'function') {
      iterator.return(undefined).catch(() => undefined);
    }
  };

  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      abort(new Error(`${label} 空闲超时（${idleTimeoutMs}ms 内未收到任何输出）`));
    }, idleTimeoutMs);
  };

  hardTimer = setTimeout(() => {
    abort(new Error(`${label} 总耗时超过硬上限（${hardTimeoutMs}ms）`));
  }, hardTimeoutMs);
  armIdle();

  try {
    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      if (!firstChunkSeen) {
        firstChunkSeen = true;
        onFirstChunk?.(Date.now() - startTs);
      }
      armIdle(); // 任意 chunk 到达即重置 idle，含 reasoning chunk
      const chunk = next.value;
      const textChunk = extractTextContent((chunk as { content?: unknown })?.content);
      if (textChunk) fullText += textChunk;
    }
  } finally {
    cleanup();
  }

  if (timeoutError) throw timeoutError;
  return fullText;
}

export async function generateStructuredData(
  settings: AISettings,
  systemPrompt: string,
  userMessage: string,
  binding?: ResolvedBinding,
  options: StructuredDataOptions = {},
): Promise<Record<string, unknown>> {
  const chatModel = pickModel(settings, binding) as ReturnType<typeof createChatModel> &
    BindableModel &
    StreamableModel;
  const model: StreamableModel =
    typeof chatModel.bind === 'function'
      ? chatModel.bind({ response_format: { type: 'json_object' } })
      : chatModel;

  const idleTimeoutMs =
    options.idleTimeoutMs ??
    (isThinkingBinding(binding)
      ? STRUCTURED_THINKING_IDLE_TIMEOUT_MS
      : STRUCTURED_IDLE_TIMEOUT_MS);
  const hardTimeoutMs = options.hardTimeoutMs ?? STRUCTURED_HARD_TIMEOUT_MS;
  const label = `LLM 结构化输出请求${options.label ? `（${options.label}）` : ''}`;
  const telemetryLabel = options.label ?? 'structured';
  const thinking = isThinkingBinding(binding);
  const tel = options.telemetry;

  let lastError: unknown;
  for (let attempt = 0; attempt <= STRUCTURED_MAX_RETRIES; attempt++) {
    const promptForAttempt =
      attempt === 0 ? systemPrompt : `${systemPrompt}${STRUCTURED_RETRY_HINT}`;
    const callStart = Date.now();
    tel?.emit('llm.start', {
      label: telemetryLabel,
      attempt,
      thinking,
      model: binding?.model ?? null,
      provider: binding?.provider?.id ?? null,
      systemChars: promptForAttempt.length,
      userChars: userMessage.length,
    });
    try {
      const fullText = await streamCollectWithIdleTimeout(
        model,
        buildPromptMessages(promptForAttempt, userMessage),
        {
          idleTimeoutMs,
          hardTimeoutMs,
          label,
          onFirstChunk: (latencyMs) => {
            tel?.emit('llm.firstChunk', { label: telemetryLabel, attempt, latencyMs });
          },
        },
      );
      const content = assertNonEmptyContent(fullText, 'LLM 返回空内容');
      const parsed = parseStructuredOutput(content);
      tel?.emit('llm.end', {
        label: telemetryLabel,
        attempt,
        durationMs: Date.now() - callStart,
        outputChars: fullText.length,
        ok: true,
        retry: attempt > 0,
      });
      return parsed;
    } catch (error) {
      lastError = error;
      tel?.emit('llm.end', {
        label: telemetryLabel,
        attempt,
        durationMs: Date.now() - callStart,
        ok: false,
        retry: attempt > 0,
        error: error instanceof Error ? error.message : String(error),
        willRetry: attempt < STRUCTURED_MAX_RETRIES,
      });
      // 仅在还有重试次数时继续；否则抛出最后一次错误
      if (attempt >= STRUCTURED_MAX_RETRIES) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('LLM 结构化输出失败');
}

export async function generateText(
  settings: AISettings,
  systemPrompt: string,
  userMessage: string,
  binding?: ResolvedBinding,
): Promise<string> {
  const response = await pickModel(settings, binding).invoke(
    buildPromptMessages(systemPrompt, userMessage),
  );

  return assertNonEmptyContent(extractTextContent(response.content), 'LLM 返回空内容');
}

export async function streamText(
  settings: AISettings,
  systemPrompt: string,
  userMessage: string,
  onChunk: (chunk: string) => void,
  callbacks?: StreamCallbacks,
  binding?: ResolvedBinding,
): Promise<string> {
  const stream = await pickModel(settings, binding).stream(
    buildPromptMessages(systemPrompt, userMessage),
  );
  let fullText = '';

  for await (const chunk of stream) {
    const reasoningChunk = extractReasoningContent(chunk);
    if (reasoningChunk) {
      callbacks?.onReasoningChunk?.(reasoningChunk);
    }

    const textChunk = extractTextContent(chunk.content);
    if (!textChunk) {
      continue;
    }

    fullText += textChunk;
    onChunk(textChunk);
  }

  return assertNonEmptyContent(fullText, 'LLM 流式返回空内容');
}

export async function streamTextWithProvider(
  provider: LLMProvider,
  model: string,
  systemPrompt: string,
  userMessage: string,
  onChunk: (chunk: string) => void,
  options?: { enableThinking?: boolean } & StreamCallbacks,
): Promise<string> {
  // 默认沿用 provider.enableThinking；调用方显式传入 options.enableThinking 时优先生效
  const chatModel = createChatModelFromProvider(provider, model, {
    enableThinking: options?.enableThinking,
  });
  const stream = await chatModel.stream(buildPromptMessages(systemPrompt, userMessage));
  let fullText = '';

  for await (const chunk of stream) {
    const reasoningChunk = extractReasoningContent(chunk);
    if (reasoningChunk) {
      options?.onReasoningChunk?.(reasoningChunk);
    }
    const textChunk = extractTextContent(chunk.content);
    if (!textChunk) continue;
    fullText += textChunk;
    onChunk(textChunk);
  }

  return assertNonEmptyContent(fullText, 'LLM 流式返回空内容');
}
