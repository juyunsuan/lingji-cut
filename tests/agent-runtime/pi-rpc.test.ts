/**
 * tests/agent-runtime/pi-rpc.test.ts
 *
 * 测试 Pi RPC 解析器：
 *   1. mapPiRpcEvent() — 纯映射函数，各事件分支。
 *   2. createPiRpcSession() — 会话壳冒烟测试（注入 fake child）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { mapPiRpcEvent, createPiRpcSession } from '../../electron/agent-runtime/parsers/pi-rpc';
import type { PiMapResult } from '../../electron/agent-runtime/parsers/pi-rpc';
import type { AgentStreamEvent } from '../../electron/agent-runtime/event-model';

// ─── mapPiRpcEvent 纯映射测试 ─────────────────────────────────────────────────

describe('mapPiRpcEvent', () => {
  // ── agent_start → status{label:'working'} ──
  describe('agent_start', () => {
    it('maps to status{label:"working"}', () => {
      const result: PiMapResult = mapPiRpcEvent({ type: 'agent_start' });
      expect(result).toEqual({
        event: { type: 'status', label: 'working' } satisfies AgentStreamEvent,
      });
    });
  });

  // ── message_update / text_delta ──
  describe('message_update text_delta', () => {
    it('maps to text_delta with delta', () => {
      const result = mapPiRpcEvent({
        type: 'message_update',
        event: { type: 'text_delta', delta: 'Hello Pi' },
      });
      expect(result).toEqual({
        event: { type: 'text_delta', delta: 'Hello Pi' } satisfies AgentStreamEvent,
      });
    });

    it('uses empty string when delta is absent', () => {
      const result = mapPiRpcEvent({
        type: 'message_update',
        event: { type: 'text_delta' },
      });
      expect(result).toEqual({ event: { type: 'text_delta', delta: '' } });
    });
  });

  // ── message_update / thinking_delta ──
  describe('message_update thinking_delta', () => {
    it('maps to thinking_delta', () => {
      const result = mapPiRpcEvent({
        type: 'message_update',
        event: { type: 'thinking_delta', delta: 'thinking...' },
      });
      expect(result).toEqual({
        event: { type: 'thinking_delta', delta: 'thinking...' } satisfies AgentStreamEvent,
      });
    });
  });

  // ── message_update / error ──
  describe('message_update error', () => {
    it('maps to error with message and raw JSON', () => {
      const raw = { type: 'message_update', event: { type: 'error', message: 'stream error' } };
      const result = mapPiRpcEvent(raw);
      expect(result).toMatchObject({
        event: {
          type: 'error',
          message: 'stream error',
          raw: JSON.stringify(raw),
        },
      });
    });

    it('uses fallback message when message field is absent', () => {
      const result = mapPiRpcEvent({
        type: 'message_update',
        event: { type: 'error' },
      });
      expect(result).toMatchObject({ event: { type: 'error', message: 'unknown error' } });
    });
  });

  // ── tool_execution_start → tool_use ──
  describe('tool_execution_start', () => {
    it('maps to tool_use with id/name/input', () => {
      const result = mapPiRpcEvent({
        type: 'tool_execution_start',
        toolCallId: 'tc-001',
        toolName: 'bash',
        args: { command: 'ls -la' },
      });
      expect(result).toEqual({
        event: {
          type: 'tool_use',
          id: 'tc-001',
          name: 'bash',
          input: { command: 'ls -la' },
        } satisfies AgentStreamEvent,
      });
    });

    it('handles missing optional fields gracefully', () => {
      const result = mapPiRpcEvent({ type: 'tool_execution_start' });
      expect(result).toMatchObject({
        event: { type: 'tool_use', id: '', name: '', input: null },
      });
    });
  });

  // ── tool_execution_end → tool_result ──
  describe('tool_execution_end', () => {
    it('maps output field to content string, isError=false', () => {
      const result = mapPiRpcEvent({
        type: 'tool_execution_end',
        toolCallId: 'tc-001',
        output: 'file1.ts\nfile2.ts',
        isError: false,
      });
      expect(result).toEqual({
        event: {
          type: 'tool_result',
          toolUseId: 'tc-001',
          content: 'file1.ts\nfile2.ts',
          isError: false,
        } satisfies AgentStreamEvent,
      });
    });

    it('maps result field as fallback when output is absent', () => {
      const result = mapPiRpcEvent({
        type: 'tool_execution_end',
        toolCallId: 'tc-002',
        result: 'ok',
      });
      expect(result).toMatchObject({
        event: { type: 'tool_result', toolUseId: 'tc-002', content: 'ok' },
      });
    });

    it('JSON-stringifies non-string output', () => {
      const result = mapPiRpcEvent({
        type: 'tool_execution_end',
        toolCallId: 'tc-003',
        output: { exitCode: 0 },
      });
      expect(result).toMatchObject({
        event: { type: 'tool_result', content: JSON.stringify({ exitCode: 0 }) },
      });
    });

    it('maps isError=true → isError:true', () => {
      const result = mapPiRpcEvent({
        type: 'tool_execution_end',
        toolCallId: 'tc-004',
        output: 'command not found',
        isError: true,
      });
      expect(result).toMatchObject({
        event: { type: 'tool_result', isError: true },
      });
    });
  });

  // ── turn_end → usage ──
  describe('turn_end', () => {
    it('extracts usage from message.usage', () => {
      const result = mapPiRpcEvent({
        type: 'turn_end',
        message: {
          usage: {
            inputTokens: 100,
            outputTokens: 200,
            costUsd: 0.005,
            durationMs: 1234,
          },
        },
      });
      expect(result).toEqual({
        event: {
          type: 'usage',
          inputTokens: 100,
          outputTokens: 200,
          costUsd: 0.005,
          durationMs: 1234,
        } satisfies AgentStreamEvent,
      });
    });

    it('extracts usage from top-level usage field', () => {
      const result = mapPiRpcEvent({
        type: 'turn_end',
        usage: { inputTokens: 50, outputTokens: 80 },
      });
      expect(result).toMatchObject({
        event: { type: 'usage', inputTokens: 50, outputTokens: 80 },
      });
    });

    it('returns usage event with all-undefined fields when no usage info', () => {
      const result = mapPiRpcEvent({ type: 'turn_end' });
      expect(result).toEqual({
        event: {
          type: 'usage',
          inputTokens: undefined,
          outputTokens: undefined,
          costUsd: undefined,
          durationMs: undefined,
        },
      });
    });
  });

  // ── agent_end → signal ──
  describe('agent_end', () => {
    it('maps to {signal:"agent_end"} with no event', () => {
      const result = mapPiRpcEvent({ type: 'agent_end' });
      expect(result).toEqual({ signal: 'agent_end' });
      expect(result.event).toBeUndefined();
    });
  });

  // ── 未知事件 → {} ──
  describe('unknown / unrecognized events', () => {
    it('returns {} for unknown type', () => {
      expect(mapPiRpcEvent({ type: 'something_else' })).toEqual({});
    });

    it('returns {} for null input', () => {
      expect(mapPiRpcEvent(null)).toEqual({});
    });

    it('returns {} for non-object primitive', () => {
      expect(mapPiRpcEvent('hello')).toEqual({});
      expect(mapPiRpcEvent(42)).toEqual({});
    });

    it('returns {} for message_update with unknown inner type', () => {
      expect(
        mapPiRpcEvent({ type: 'message_update', event: { type: 'unsupported_inner' } }),
      ).toEqual({});
    });

    it('returns {} for message_update without inner event', () => {
      expect(mapPiRpcEvent({ type: 'message_update' })).toEqual({});
    });
  });
});

// ─── createPiRpcSession 会话壳冒烟测试 ───────────────────────────────────────

/**
 * 构造一个可以模拟 child 进程的 fake child。
 * stdout：EventEmitter（支持 on/off/emit）充当 ReadableStream。
 * stdin：{ write: vi.fn() } 充当 WritableStream。
 */
function makeFakeChild() {
  const stdout = new EventEmitter() as EventEmitter & NodeJS.ReadableStream;
  const stdin = { write: vi.fn() } as unknown as NodeJS.WritableStream;
  return { child: { stdout, stdin }, stdout, stdin };
}

describe('createPiRpcSession (smoke tests)', () => {
  let onEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onEvent = vi.fn();
  });

  it('calls onEvent with status{working} when agent_start arrives on stdout', () => {
    const { child, stdout } = makeFakeChild();

    createPiRpcSession({ child, prompt: 'Hello', onEvent });

    // 喂入 agent_start 行
    stdout.emit('data', Buffer.from(JSON.stringify({ type: 'agent_start' }) + '\n'));

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'status', label: 'working' }),
    );
  });

  it('routes text_delta via message_update', () => {
    const { child, stdout } = makeFakeChild();

    createPiRpcSession({ child, prompt: 'Hi', onEvent });

    stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({ type: 'message_update', event: { type: 'text_delta', delta: 'world' } }) +
          '\n',
      ),
    );

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text_delta', delta: 'world' }),
    );
  });

  it('emits turn_end when agent_end arrives', () => {
    const { child, stdout } = makeFakeChild();

    createPiRpcSession({ child, prompt: 'Go', onEvent });

    stdout.emit('data', Buffer.from(JSON.stringify({ type: 'agent_end' }) + '\n'));

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'turn_end' }),
    );
  });

  it('writes prompt command to stdin on startup (no parentSession)', () => {
    const { child, stdin } = makeFakeChild();

    createPiRpcSession({ child, prompt: 'test prompt', onEvent });

    const writeCalls: string[] = (stdin.write as ReturnType<typeof vi.fn>).mock.calls.map(
      (args: unknown[]) => args[0] as string,
    );
    // 只有一条 prompt 命令
    expect(writeCalls).toHaveLength(1);
    const cmd = JSON.parse(writeCalls[0]);
    expect(cmd.method).toBe('prompt');
    expect(cmd.params.prompt).toBe('test prompt');
  });

  it('writes new_session command then prompt when parentSession is provided', () => {
    const { child, stdin } = makeFakeChild();

    createPiRpcSession({
      child,
      prompt: 'resume question',
      parentSession: 'sess-abc',
      onEvent,
    });

    const writeCalls: string[] = (stdin.write as ReturnType<typeof vi.fn>).mock.calls.map(
      (args: unknown[]) => args[0] as string,
    );
    expect(writeCalls).toHaveLength(2);

    const firstCmd = JSON.parse(writeCalls[0]);
    expect(firstCmd.method).toBe('new_session');
    expect(firstCmd.params.parentSession).toBe('sess-abc');

    const secondCmd = JSON.parse(writeCalls[1]);
    expect(secondCmd.method).toBe('prompt');
  });

  it('dispose() removes stdout listeners', () => {
    const { child, stdout } = makeFakeChild();

    const { dispose } = createPiRpcSession({ child, prompt: 'x', onEvent });
    dispose();

    // 事件在 dispose 后发出，不应触发 onEvent
    stdout.emit('data', Buffer.from(JSON.stringify({ type: 'agent_start' }) + '\n'));
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('processes multiple events in a single chunk', () => {
    const { child, stdout } = makeFakeChild();

    createPiRpcSession({ child, prompt: 'multi', onEvent });

    const chunk = [
      JSON.stringify({ type: 'agent_start' }),
      JSON.stringify({ type: 'message_update', event: { type: 'text_delta', delta: 'A' } }),
      JSON.stringify({ type: 'message_update', event: { type: 'text_delta', delta: 'B' } }),
      JSON.stringify({ type: 'agent_end' }),
    ].join('\n') + '\n';

    stdout.emit('data', Buffer.from(chunk));

    const types = onEvent.mock.calls.map((c: unknown[]) => (c[0] as AgentStreamEvent).type);
    expect(types).toEqual(['status', 'text_delta', 'text_delta', 'turn_end']);
  });
});
