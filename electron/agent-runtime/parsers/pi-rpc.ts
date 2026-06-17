/**
 * pi-rpc.ts
 *
 * Pi JSON-RPC 协议解析器（对齐真实 `pi --mode rpc` 协议）。
 *
 * Pi 是双向 JSON-RPC 方言：stdin 发命令，stdout 读事件。每行一条 JSON。
 *
 * 命令形状（出站，stdin）：`{ id, type, ...params }`
 *   - prompt:       { id, type:'prompt', message }
 *   - new_session:  { id, type:'new_session', parentSession }
 *   - abort:        { id, type:'abort' }
 *   - 扩展 UI 应答: { type:'extension_ui_response', id, ...result }
 *
 * 事件形状（入站，stdout）：`{ type, ... }`
 *   - agent_start / turn_start / message_update(assistantMessageEvent) /
 *     tool_execution_start / tool_execution_end / turn_end / agent_end /
 *     extension_ui_request / response(命令回执) …
 *
 * 关键：pi 在需要确认（写文件/跑命令等）时会发 `extension_ui_request` 并**阻塞**
 * 等待 `extension_ui_response`。桌面端没有 pi 自带对话框的承载面，必须自动应答，
 * 否则整轮卡死、表现为「requested permissions … but you haven't granted it yet」。
 * 与参考实现 open-design 的 replyExtensionUi 一致：confirm→true，select→首项。
 */

import fs from 'node:fs';
import path from 'node:path';
import type { AgentStreamEvent } from '../event-model';
import { createJsonLineStream } from './line-stream';

// ─── 工具 ────────────────────────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
}

function recordFromUnknown(v: unknown): Record<string, unknown> | undefined {
  const direct = asRecord(v);
  if (direct) return direct;
  if (typeof v !== 'string' || !v.trim().startsWith('{')) return undefined;
  try {
    return asRecord(JSON.parse(v));
  } catch {
    return undefined;
  }
}

function firstNumber(...vals: unknown[]): number | undefined {
  for (const v of vals) if (typeof v === 'number') return v;
  return undefined;
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) if (typeof v === 'string' && v) return v;
  return undefined;
}

const FILE_PATH_KEYS = [
  'path',
  'file_path',
  'filePath',
  'filepath',
  'target',
  'targetPath',
  'target_path',
  'uri',
  'file',
  'fileName',
  'filename',
];
const FILE_EDIT_OLD_KEYS = ['oldString', 'old_string', 'oldText', 'old_text', 'before', 'original', 'old'];
const FILE_EDIT_NEW_KEYS = ['newString', 'new_string', 'newText', 'new_text', 'after', 'replacement', 'replace', 'new'];
const MAX_SNAPSHOT_BYTES = 512 * 1024;

/** pi 的 fire-and-forget 扩展方法：无需应答，静默消费。 */
const FIRE_AND_FORGET_METHODS = new Set([
  'setStatus',
  'setWidget',
  'notify',
  'setTitle',
  'set_editor_text',
]);

/** 从 tool_execution_end 抽取文本内容：result.content[] → output → result。 */
function extractToolContent(r: Record<string, unknown>): string {
  const result = asRecord(r['result']);
  const content = result?.['content'];
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        const item = asRecord(c);
        return item?.['type'] === 'text' ? String(item['text'] ?? '') : JSON.stringify(c);
      })
      .join('\n');
  }
  const rawOut = r['output'] ?? r['result'];
  return typeof rawOut === 'string' ? rawOut : JSON.stringify(rawOut ?? null);
}

function extractAssistantText(message: Record<string, unknown> | undefined): string {
  if (!message || message['role'] !== 'assistant') return '';
  const content = message['content'];
  if (!Array.isArray(content)) return '';
  return content
    .map((c) => {
      const item = asRecord(c);
      return item?.['type'] === 'text' ? String(item['text'] ?? '') : '';
    })
    .filter(Boolean)
    .join('\n');
}

function parseToolArgs(toolCall: Record<string, unknown>): unknown {
  const args = toolCall['arguments'];
  if (args && typeof args === 'object') return args;

  const partialArgs = toolCall['partialArgs'];
  if (typeof partialArgs !== 'string' || !partialArgs) return undefined;
  try {
    return JSON.parse(partialArgs);
  } catch {
    return undefined;
  }
}

function pickStringDeep(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }

  const nestedKeys = ['input', 'args', 'arguments', 'params', 'data', 'payload', 'file', 'target', 'options'];
  for (const key of nestedKeys) {
    const value = pickStringDeep(recordFromUnknown(record[key]), keys);
    if (value) return value;
  }

  for (const value of Object.values(record)) {
    const found = pickStringDeep(recordFromUnknown(value), keys);
    if (found) return found;
  }
  return undefined;
}

function isFileEditTool(name: string | undefined, input: unknown): boolean {
  const normalized = String(name || '').toLowerCase();
  const args = recordFromUnknown(input);
  if (/(edit|write|create|overwrite|patch|apply|replace|delete|remove|unlink)/.test(normalized)) {
    return true;
  }
  return Boolean(
    pickStringDeep(args, FILE_PATH_KEYS) &&
      pickStringDeep(args, [...FILE_EDIT_OLD_KEYS, ...FILE_EDIT_NEW_KEYS]),
  );
}

function resolveSnapshotPath(cwd: string | undefined, input: unknown): string | null {
  if (!cwd) return null;
  const args = recordFromUnknown(input);
  const rawPath = pickStringDeep(args, FILE_PATH_KEYS);
  if (!rawPath || rawPath.startsWith('file://')) return null;
  const candidate = path.isAbsolute(rawPath) ? rawPath : path.resolve(cwd, rawPath);
  const relative = path.relative(cwd, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return candidate;
}

function readSmallTextFile(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_SNAPSHOT_BYTES) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function injectFileSnapshot(
  input: unknown,
  snapshot: { path: string; before: string | null; after: string | null },
): unknown {
  const base = recordFromUnknown(input);
  if (!base) return input;
  return {
    ...base,
    path: pickStringDeep(base, FILE_PATH_KEYS) ?? snapshot.path,
    ...(snapshot.before !== null ? { before: snapshot.before } : {}),
    ...(snapshot.after !== null ? { after: snapshot.after } : {}),
  };
}

function getPartialToolArgs(toolCall: Record<string, unknown>): string | undefined {
  const partialArgs = toolCall['partialArgs'];
  return typeof partialArgs === 'string' && partialArgs ? partialArgs : undefined;
}

function extractMessageToolCall(inner: Record<string, unknown>): Record<string, unknown> | undefined {
  const direct = asRecord(inner['toolCall']);
  if (direct) return direct;

  const partial = asRecord(inner['partial']);
  const content = partial?.['content'];
  if (!Array.isArray(content)) return undefined;

  const index = typeof inner['contentIndex'] === 'number' ? inner['contentIndex'] : 0;
  return asRecord(content[index]);
}

// ─── 纯映射层 ──────────────────────────────────────────────────────────────────

export type PiMapResult = {
  event?: AgentStreamEvent;
  events?: AgentStreamEvent[];
  signal?: 'agent_end';
};

/**
 * 把 Pi RPC 的一条原始事件对象映射成 AgentStreamEvent 或控制信号。
 *
 * 容错：未知 type 返回 {}（安静忽略）；字段缺失走兜底。
 * message_update 优先读真实字段 `assistantMessageEvent`，兼容旧的 `event`。
 */
export function mapPiRpcEvent(raw: unknown): PiMapResult {
  const r = asRecord(raw);
  if (!r) return {};
  const type = r['type'];

  switch (type) {
    case 'agent_start':
    case 'turn_start':
      return { event: { type: 'status', label: 'working' } };

    case 'message_update': {
      const inner = asRecord(r['assistantMessageEvent']) ?? asRecord(r['event']);
      if (!inner) return {};
      const innerType = inner['type'];

      if (innerType === 'text_delta') {
        return { event: { type: 'text_delta', delta: (inner['delta'] as string) ?? '' } };
      }
      if (innerType === 'thinking_delta') {
        return { event: { type: 'thinking_delta', delta: (inner['delta'] as string) ?? '' } };
      }
      if (innerType === 'thinking_start') {
        return { event: { type: 'thinking_start' } };
      }
      if (innerType === 'thinking_end') {
        return { event: { type: 'thinking_end' } };
      }
      if (
        innerType === 'toolcall_start' ||
        innerType === 'toolcall_delta' ||
        innerType === 'toolcall_end'
      ) {
        const toolCall = extractMessageToolCall(inner);
        if (!toolCall) return {};

        const id = firstString(toolCall['id'], inner['toolCallId']) ?? '';
        if (!id) return {};

        const name = firstString(toolCall['name'], toolCall['toolName'], inner['toolName']) ?? '';
        const input = parseToolArgs(toolCall);
        if (input !== undefined) {
          return { event: { type: 'tool_use', id, name, input } };
        }

        const delta = getPartialToolArgs(toolCall);
        if (delta) {
          return { event: { type: 'tool_input_delta', id, delta } };
        }
        return { event: { type: 'tool_use', id, name, input: null } };
      }
      if (innerType === 'error') {
        const message =
          (inner['reason'] as string) ||
          (inner['message'] as string) ||
          (inner['delta'] as string) ||
          'unknown error';
        return { event: { type: 'error', message, raw: JSON.stringify(raw) } };
      }
      return {};
    }

    case 'tool_execution_start': {
      const id = (r['toolCallId'] as string | undefined) ?? '';
      // 真实字段 toolName；对字段命名差异做容错。
      const name =
        (r['toolName'] as string | undefined) ??
        (r['tool_name'] as string | undefined) ??
        (r['name'] as string | undefined) ??
        '';
      const input = r['args'] ?? r['input'] ?? null;
      return { event: { type: 'tool_use', id, name, input } };
    }

    case 'tool_execution_end': {
      const toolUseId = (r['toolCallId'] as string | undefined) ?? '';
      const name =
        (r['toolName'] as string | undefined) ??
        (r['tool_name'] as string | undefined) ??
        (r['name'] as string | undefined) ??
        undefined;
      const input = r['args'] ?? r['input'];
      const content = extractToolContent(r);
      const isError = (r['isError'] as boolean | undefined) ?? false;
      return { event: { type: 'tool_result', toolUseId, content, isError, name, input } };
    }

    case 'turn_end': {
      const message = asRecord(r['message']);
      const usageObj = asRecord(message?.['usage']) ?? asRecord(r['usage']);
      // 真实字段 input/output（+ inputTokens/outputTokens 兼容旧推断）。
      const inputTokens = firstNumber(usageObj?.['input'], usageObj?.['inputTokens']);
      const outputTokens = firstNumber(usageObj?.['output'], usageObj?.['outputTokens']);
      const cost = asRecord(usageObj?.['cost']);
      const costUsd = firstNumber(cost?.['total'], cost?.['totalCost'], usageObj?.['costUsd']);
      const durationMs = firstNumber(usageObj?.['durationMs']);
      const usageEvent: AgentStreamEvent = {
        type: 'usage',
        inputTokens,
        outputTokens,
        costUsd,
        durationMs,
      };
      const text = extractAssistantText(message);
      if (text) {
        return {
          events: [
            { type: 'text_delta', delta: text },
            usageEvent,
          ],
        };
      }
      return { event: usageEvent };
    }

    case 'message_end':
      // usage 已由 turn_end、工具块已由 tool_execution_* 发出，无需重复。
      return {};

    case 'extension_error': {
      const message = (r['error'] as string) || 'Extension error';
      return { event: { type: 'error', message, raw: JSON.stringify(raw) } };
    }

    case 'agent_end':
      return { signal: 'agent_end' };

    default:
      return {};
  }
}

// ─── 会话壳 ───────────────────────────────────────────────────────────────────

export interface PiRpcSessionDeps {
  /** 可注入 fake child，便于测试 */
  child: {
    stdout: NodeJS.ReadableStream;
    stdin: NodeJS.WritableStream;
  };
  prompt: string;
  cwd?: string;
  model?: string;
  /**
   * parentSession：有值时先发 new_session{parentSession}，待 pi 回执确认后再发
   * prompt（resume 的 prompt 只含最新一轮，父会话加载失败若继续会丢历史上下文）。
   */
  parentSession?: string | null;
  onEvent: (ev: AgentStreamEvent) => void;
}

export interface PiRpcSession {
  dispose(): void;
  /** 发送 RPC abort，让 pi 优雅停止当前轮（SIGTERM 兜底由调用方负责）。 */
  abort(): void;
}

/**
 * createPiRpcSession
 *
 * 连接 child 进程 stdio，驱动 mapPiRpcEvent，将归一化事件路由到 onEvent。
 * 自动应答 extension_ui_request（否则 pi 阻塞）；signal:'agent_end' 时 emit turn_end。
 */
export function createPiRpcSession(deps: PiRpcSessionDeps): PiRpcSession {
  const { child, prompt, cwd, parentSession, onEvent } = deps;
  const stdin = child.stdin;

  let finished = false;
  let stdinOpen = true;
  let nextRpcId = 1;
  let getStateRpcId: number | null = null;
  let parentSessionRpcId: number | null = null;
  let promptRpcId: number | null = null;
  let sawStreamingText = false;
  const streamedToolInputs = new Map<string, unknown>();
  const streamedToolNames = new Map<string, string>();
  const emittedToolIds = new Set<string>();
  const fileSnapshots = new Map<string, { path: string; before: string | null }>();

  function sendCommand(type: string, params: Record<string, unknown> = {}): number | null {
    if (!stdinOpen) return null;
    const id = nextRpcId++;
    try {
      stdin.write(JSON.stringify({ id, type, ...params }) + '\n');
    } catch {
      // EPIPE 等：忽略（进程可能已退出）
    }
    return id;
  }

  function sendPromptCommand(): void {
    promptRpcId = sendCommand('prompt', { message: prompt });
  }

  function sendGetStateCommand(): void {
    getStateRpcId = sendCommand('get_state');
  }

  /** 自动应答 pi 的扩展 UI 请求，保持 pi 不阻塞。 */
  function replyExtensionUi(raw: Record<string, unknown>): void {
    if (raw['id'] == null) return;
    const method = raw['method'];
    // fire-and-forget：无需应答。
    if (typeof method === 'string' && FIRE_AND_FORGET_METHODS.has(method)) return;

    let result: Record<string, unknown>;
    if (method === 'confirm') {
      result = { confirmed: true };
    } else {
      const params = asRecord(raw['params']);
      const opts = (params?.['options'] ?? raw['options']) as unknown;
      if (Array.isArray(opts) && opts.length > 0) {
        const first = opts[0];
        result =
          typeof first === 'string'
            ? { value: first }
            : { value: asRecord(first)?.['label'] ?? asRecord(first)?.['value'] ?? '' };
      } else {
        result = { cancelled: true };
      }
    }
    if (!stdinOpen) return;
    try {
      stdin.write(JSON.stringify({ type: 'extension_ui_response', id: raw['id'], ...result }) + '\n');
    } catch {
      // 忽略写入失败
    }
  }

  function rememberFileSnapshot(event: Extract<AgentStreamEvent, { type: 'tool_use' }>): void {
    if (!isFileEditTool(event.name, event.input)) return;
    const filePath = resolveSnapshotPath(cwd, event.input);
    if (!filePath) return;
    const before = readSmallTextFile(filePath);
    fileSnapshots.set(event.id, { path: path.relative(cwd || '', filePath) || filePath, before });
  }

  function enrichToolResultInput(
    event: Extract<AgentStreamEvent, { type: 'tool_result' }>,
    input: unknown,
  ): unknown {
    const snapshot = fileSnapshots.get(event.toolUseId);
    if (!snapshot) return input;
    fileSnapshots.delete(event.toolUseId);
    const filePath = cwd ? path.resolve(cwd, snapshot.path) : snapshot.path;
    const after = readSmallTextFile(filePath);
    if (snapshot.before === after) return input;
    return injectFileSnapshot(input, { ...snapshot, after });
  }

  function handleJson(obj: unknown): void {
    const r = asRecord(obj);
    if (!r) return;
    if (finished) return;
    if (r['type'] === 'agent_start' || r['type'] === 'turn_start') {
      sawStreamingText = false;
    }

    // 扩展 UI 请求：自动应答，避免 pi 阻塞导致整轮卡死。
    if (r['type'] === 'extension_ui_request') {
      replyExtensionUi(r);
      return;
    }

    // RPC 命令回执（prompt / new_session 的 ack）：非 agent 事件。
    if (r['type'] === 'response') {
      if (r['id'] === getStateRpcId) {
        const data = asRecord(r['data']);
        const sessionId = data?.['sessionId'];
        if (typeof sessionId === 'string' && sessionId) {
          onEvent({ type: 'status', label: 'connected', sessionId });
        }
        return;
      }
      if (r['id'] === parentSessionRpcId) {
        if (r['success'] === false) {
          finished = true;
          onEvent({
            type: 'error',
            message: `parent session rejected: ${String(r['error'] ?? 'unknown')}`,
          });
          return;
        }
        // 父会话已加载：现在才发 prompt。
        sendGetStateCommand();
        sendPromptCommand();
        return;
      }
      if (r['id'] === promptRpcId && r['success'] === false) {
        finished = true;
        onEvent({ type: 'error', message: `prompt rejected: ${String(r['error'] ?? 'unknown')}` });
      }
      return;
    }

    const result = mapPiRpcEvent(r);
    const events = result.events ?? (result.event ? [result.event] : []);
    for (const event of events) {
      if (event.type === 'text_delta') {
        if (result.events && sawStreamingText) {
          continue;
        }
        sawStreamingText = true;
      }
      if (event.type === 'tool_use') {
        if (event.name) {
          streamedToolNames.set(event.id, event.name);
        }
        if (event.input != null) {
          streamedToolInputs.set(event.id, event.input);
        }
        rememberFileSnapshot(event);

        const rawType = r['type'];
        if (rawType === 'tool_execution_start') {
          const cachedInput = streamedToolInputs.get(event.id);
          if (emittedToolIds.has(event.id)) {
            onEvent({
              type: 'tool_input_delta',
              id: event.id,
              delta: JSON.stringify(event.input ?? cachedInput ?? null),
            });
          } else {
            const cachedName = streamedToolNames.get(event.id);
            emittedToolIds.add(event.id);
            onEvent({
              ...event,
              name: event.name || cachedName || event.name,
              input: event.input ?? cachedInput ?? null,
            });
          }
          continue;
        }

        if (emittedToolIds.has(event.id)) {
          onEvent({
            type: 'tool_input_delta',
            id: event.id,
            delta: JSON.stringify(event.input ?? streamedToolInputs.get(event.id) ?? null),
          });
          continue;
        }

        emittedToolIds.add(event.id);
      }
      if (event.type === 'tool_input_delta') {
        streamedToolInputs.set(event.id, { partialArgs: event.delta });
      }
      if (event.type === 'tool_result') {
        const cachedInput = streamedToolInputs.get(event.toolUseId);
        const cachedName = streamedToolNames.get(event.toolUseId);
        const input = enrichToolResultInput(event, event.input ?? cachedInput);
        onEvent({
          ...event,
          name: event.name || cachedName,
          input,
        });
        continue;
      }
      onEvent(event);
    }
    if (result.signal === 'agent_end') {
      finished = true;
      onEvent({ type: 'turn_end' });
    }
  }

  const lineStream = createJsonLineStream({
    onJson: handleJson,
    onRaw: (_line) => {
      // 非 JSON 行静默忽略（Pi stdout 应全为 JSON）
    },
  });

  function onData(chunk: string | Buffer): void {
    lineStream.feed(chunk);
  }
  function onEnd(): void {
    lineStream.flush();
  }

  child.stdout.on('data', onData);
  child.stdout.on('end', onEnd);

  // 出站：有 parentSession 先建会话（等回执再发 prompt），否则直接发 prompt。
  if (parentSession) {
    parentSessionRpcId = sendCommand('new_session', { parentSession });
  } else {
    sendGetStateCommand();
    sendPromptCommand();
  }

  function dispose(): void {
    stdinOpen = false;
    child.stdout.off('data', onData);
    child.stdout.off('end', onEnd);
  }

  function abort(): void {
    if (finished) return;
    finished = true;
    sendCommand('abort');
  }

  return { dispose, abort };
}
