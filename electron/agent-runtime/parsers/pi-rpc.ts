/**
 * pi-rpc.ts
 *
 * Pi JSON-RPC 协议解析器。
 *
 * Pi 是双向 JSON-RPC 方言：stdin 发命令，stdout 读事件。
 * 每行 stdout 是一条完整的 JSON 事件对象。
 *
 * 本文件分两层：
 *   1. mapPiRpcEvent() — 纯映射函数，把 Pi 原始事件映射成 AgentStreamEvent 或控制信号。
 *   2. createPiRpcSession() — 会话壳，连接 child 进程 stdio、驱动 mapPiRpcEvent。
 */

import type { AgentStreamEvent } from '../event-model';
import { createJsonLineStream } from './line-stream';

// ─── 纯映射层 ──────────────────────────────────────────────────────────────────

export type PiMapResult = { event?: AgentStreamEvent; signal?: 'agent_end' };

/**
 * 把 Pi RPC 的一条原始事件对象映射成 AgentStreamEvent 或控制信号。
 *
 * 容错策略：所有字段访问使用可选链；未知 type 返回 {}（安静忽略）。
 */
export function mapPiRpcEvent(raw: unknown): PiMapResult {
  if (!raw || typeof raw !== 'object') return {};

  const r = raw as Record<string, unknown>;
  const type = r['type'];

  switch (type) {
    // ── agent_start → status{label:'working'} ──
    case 'agent_start': {
      const event: AgentStreamEvent = { type: 'status', label: 'working' };
      return { event };
    }

    // ── message_update → 内嵌 event 分发 ──
    case 'message_update': {
      const inner = r['event'] as Record<string, unknown> | undefined;
      if (!inner || typeof inner !== 'object') return {};

      const innerType = inner['type'];

      if (innerType === 'text_delta') {
        const delta = (inner['delta'] as string | undefined) ?? '';
        const event: AgentStreamEvent = { type: 'text_delta', delta };
        return { event };
      }

      if (innerType === 'thinking_delta') {
        const delta = (inner['delta'] as string | undefined) ?? '';
        const event: AgentStreamEvent = { type: 'thinking_delta', delta };
        return { event };
      }

      if (innerType === 'error') {
        const message = (inner['message'] as string | undefined) ?? 'unknown error';
        const event: AgentStreamEvent = {
          type: 'error',
          message,
          raw: JSON.stringify(raw),
        };
        return { event };
      }

      return {};
    }

    // ── tool_execution_start → tool_use ──
    case 'tool_execution_start': {
      const id = (r['toolCallId'] as string | undefined) ?? '';
      const name = (r['toolName'] as string | undefined) ?? '';
      const input = (r['args'] as unknown) ?? null;
      const event: AgentStreamEvent = { type: 'tool_use', id, name, input };
      return { event };
    }

    // ── tool_execution_end → tool_result ──
    case 'tool_execution_end': {
      const toolUseId = (r['toolCallId'] as string | undefined) ?? '';
      // Pi 协议中输出字段可能是 output 或 result
      const rawOutput = r['output'] ?? r['result'];
      const content =
        typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput ?? null);
      const isError = (r['isError'] as boolean | undefined) ?? false;
      const event: AgentStreamEvent = { type: 'tool_result', toolUseId, content, isError };
      return { event };
    }

    // ── turn_end → usage（顶层 usage 或 message.usage 两种形状均支持） ──
    case 'turn_end': {
      // 尝试 {type:'turn_end', message:{usage}} 形状
      const message = r['message'] as Record<string, unknown> | undefined;
      const usageObj =
        (message?.['usage'] as Record<string, unknown> | undefined) ??
        (r['usage'] as Record<string, unknown> | undefined);

      const inputTokens = (usageObj?.['inputTokens'] as number | undefined) ?? undefined;
      const outputTokens = (usageObj?.['outputTokens'] as number | undefined) ?? undefined;
      const costUsd = (usageObj?.['costUsd'] as number | undefined) ?? undefined;
      const durationMs = (usageObj?.['durationMs'] as number | undefined) ?? undefined;

      const event: AgentStreamEvent = {
        type: 'usage',
        inputTokens,
        outputTokens,
        costUsd,
        durationMs,
      };
      return { event };
    }

    // ── agent_end → signal（上层据此 emit turn_end） ──
    case 'agent_end': {
      return { signal: 'agent_end' };
    }

    // ── 未知事件 → 忽略 ──
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
   * parentSession：有值时先发 new_session{parentSession} 再发 prompt；
   * null/undefined 时直接发 prompt 命令。
   */
  parentSession?: string | null;
  onEvent: (ev: AgentStreamEvent) => void;
}

/**
 * createPiRpcSession
 *
 * 连接 child 进程 stdio，驱动 mapPiRpcEvent，将归一化事件路由到 onEvent。
 * signal:'agent_end' 时额外 emit {type:'turn_end'}。
 *
 * stdin 命令格式：JSON-RPC 行（每行一条 JSON）。
 * TODO: 确认 Pi 实际 RPC 方法名与参数字段，当前使用推断的合理形状。
 */
export function createPiRpcSession(deps: PiRpcSessionDeps): { dispose(): void } {
  const { child, prompt, cwd, model, parentSession, onEvent } = deps;

  const lineStream = createJsonLineStream({
    onJson: (obj) => {
      const result = mapPiRpcEvent(obj);

      if (result.event) {
        onEvent(result.event);
      }

      if (result.signal === 'agent_end') {
        // agent_end 触发 turn_end，上层据此结束会话
        onEvent({ type: 'turn_end' });
      }
    },
    onRaw: (_line) => {
      // 非 JSON 行静默忽略（Pi stdout 应全为 JSON）
    },
  });

  // 监听 stdout
  function onData(chunk: string | Buffer): void {
    lineStream.feed(chunk);
  }

  function onEnd(): void {
    lineStream.flush();
  }

  child.stdout.on('data', onData);
  child.stdout.on('end', onEnd);

  // 写入 stdin 命令
  // TODO: 核实 Pi rpc 实际命令名称与字段（当前为推断形状）
  if (parentSession) {
    // 多轮 resume：先建立会话再发 prompt
    const newSessionCmd = JSON.stringify({
      method: 'new_session',
      params: { parentSession, cwd, model },
    });
    child.stdin.write(newSessionCmd + '\n');
  }

  // 发送 prompt 命令
  const promptCmd = JSON.stringify({
    method: 'prompt',
    params: { prompt, cwd, model },
  });
  child.stdin.write(promptCmd + '\n');

  function dispose(): void {
    child.stdout.off('data', onData);
    child.stdout.off('end', onEnd);
  }

  return { dispose };
}
