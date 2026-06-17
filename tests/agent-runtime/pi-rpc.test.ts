/**
 * tests/agent-runtime/pi-rpc.test.ts
 *
 * 测试 Pi RPC 解析器：
 *   1. mapPiRpcEvent() — 纯映射函数，各事件分支。
 *   2. createPiRpcSession() — 会话壳冒烟测试（注入 fake child）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

  describe('message_update toolcall events', () => {
    it('maps toolcall_start to tool_use with streamed arguments', () => {
      const result = mapPiRpcEvent({
        type: 'message_update',
        assistantMessageEvent: {
          type: 'toolcall_start',
          toolCall: {
            id: 'tc-bash',
            name: 'bash',
            arguments: { command: 'npm test -- --run tests/agent-runtime/pi-rpc.test.ts' },
          },
        },
      });

      expect(result).toEqual({
        event: {
          type: 'tool_use',
          id: 'tc-bash',
          name: 'bash',
          input: { command: 'npm test -- --run tests/agent-runtime/pi-rpc.test.ts' },
        } satisfies AgentStreamEvent,
      });
    });

    it('maps partial toolcall args to tool_input_delta when JSON is incomplete', () => {
      const result = mapPiRpcEvent({
        type: 'message_update',
        assistantMessageEvent: {
          type: 'toolcall_delta',
          toolCall: {
            id: 'tc-bash',
            name: 'bash',
            partialArgs: '{"command":"npm',
          },
        },
      });

      expect(result).toEqual({
        event: {
          type: 'tool_input_delta',
          id: 'tc-bash',
          delta: '{"command":"npm',
        } satisfies AgentStreamEvent,
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
        toolName: 'bash',
        args: { command: 'wc -l original.md' },
        output: 'file1.ts\nfile2.ts',
        isError: false,
      });
      expect(result).toEqual({
        event: {
          type: 'tool_result',
          toolUseId: 'tc-001',
          name: 'bash',
          input: { command: 'wc -l original.md' },
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
        event: { type: 'tool_result', toolUseId: 'tc-002', content: 'ok', name: undefined, input: undefined },
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

    it('maps completed assistant text from turn_end.message when no streaming delta was emitted', () => {
      const result = mapPiRpcEvent({
        type: 'turn_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'final answer from pi' }],
        },
      });

      expect(result).toEqual({
        events: [
          { type: 'text_delta', delta: 'final answer from pi' },
          {
            type: 'usage',
            inputTokens: undefined,
            outputTokens: undefined,
            costUsd: undefined,
            durationMs: undefined,
          },
        ],
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

  it('writes get_state then prompt command to stdin on startup', () => {
    const { child, stdin } = makeFakeChild();

    createPiRpcSession({ child, prompt: 'test prompt', onEvent });

    const writeCalls: string[] = (stdin.write as ReturnType<typeof vi.fn>).mock.calls.map(
      (args: unknown[]) => args[0] as string,
    );
    // 先请求 session state 以拿到 Pi sessionId，再发送 prompt。
    expect(writeCalls).toHaveLength(2);
    const stateCmd = JSON.parse(writeCalls[0]);
    expect(stateCmd.type).toBe('get_state');
    expect(typeof stateCmd.id).toBe('number');
    const promptCmd = JSON.parse(writeCalls[1]);
    expect(promptCmd.type).toBe('prompt');
    expect(promptCmd.message).toBe('test prompt');
    expect(typeof promptCmd.id).toBe('number');
  });

  it('emits session_started from get_state response data.sessionId', () => {
    const { child, stdin, stdout } = makeFakeChild();

    createPiRpcSession({ child, prompt: 'hello', onEvent });

    const getState = JSON.parse(
      (stdin.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string,
    );
    stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          type: 'response',
          id: getState.id,
          command: 'get_state',
          success: true,
          data: { sessionId: 'pi-session-123' },
        }) + '\n',
      ),
    );

    expect(onEvent).toHaveBeenCalledWith({
      type: 'status',
      label: 'connected',
      sessionId: 'pi-session-123',
    });
  });

  it('parentSession：先发 new_session，待 response 回执后才发 prompt（门控）', () => {
    const { child, stdin, stdout } = makeFakeChild();

    createPiRpcSession({
      child,
      prompt: 'resume question',
      parentSession: 'sess-abc',
      onEvent,
    });

    const writes = () =>
      (stdin.write as ReturnType<typeof vi.fn>).mock.calls.map((a: unknown[]) => JSON.parse(a[0] as string));

    // 初始只写 new_session；get_state 要在新会话创建后读取，避免拿到旧 sessionId。
    let cmds = writes();
    expect(cmds).toHaveLength(1);
    expect(cmds[0].type).toBe('new_session');
    expect(cmds[0].parentSession).toBe('sess-abc');
    const newSessionId = cmds[0].id;

    // pi 回执 new_session 成功 → 此时才发 prompt
    stdout.emit(
      'data',
      Buffer.from(JSON.stringify({ type: 'response', id: newSessionId, success: true }) + '\n'),
    );
    cmds = writes();
    expect(cmds).toHaveLength(3);
    expect(cmds[1].type).toBe('get_state');
    expect(cmds[2].type).toBe('prompt');
    expect(cmds[2].message).toBe('resume question');
  });

  it('自动应答 extension_ui_request（confirm→confirmed:true），避免 pi 阻塞', () => {
    const { child, stdin, stdout } = makeFakeChild();
    createPiRpcSession({ child, prompt: 'do', onEvent });

    stdout.emit(
      'data',
      Buffer.from(JSON.stringify({ type: 'extension_ui_request', id: 9, method: 'confirm' }) + '\n'),
    );

    const writes = (stdin.write as ReturnType<typeof vi.fn>).mock.calls.map(
      (a: unknown[]) => JSON.parse(a[0] as string),
    );
    const reply = writes.find((c: Record<string, unknown>) => c.type === 'extension_ui_response');
    expect(reply).toBeDefined();
    expect(reply.id).toBe(9);
    expect(reply.confirmed).toBe(true);
  });

  it('abort() 发送 RPC abort 命令', () => {
    const { child, stdin } = makeFakeChild();
    const session = createPiRpcSession({ child, prompt: 'go', onEvent });
    session.abort();
    const writes = (stdin.write as ReturnType<typeof vi.fn>).mock.calls.map(
      (a: unknown[]) => JSON.parse(a[0] as string),
    );
    expect(writes.some((c: Record<string, unknown>) => c.type === 'abort')).toBe(true);
  });

  it('routes text_delta via assistantMessageEvent（真实字段名）', () => {
    const { child, stdout } = makeFakeChild();
    createPiRpcSession({ child, prompt: 'hi', onEvent });
    stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta: 'real' },
        }) + '\n',
      ),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text_delta', delta: 'real' }),
    );
  });

  it('同一个 toolcall 多次流式更新时只创建一次工具调用，后续更新 rawInput', () => {
    const { child, stdout } = makeFakeChild();
    createPiRpcSession({ child, prompt: 'tool', onEvent });

    stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          type: 'message_update',
          assistantMessageEvent: {
            type: 'toolcall_start',
            toolCall: { id: 'tc-1', name: 'bash', arguments: { command: 'npm' } },
          },
        }) + '\n',
      ),
    );
    stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          type: 'message_update',
          assistantMessageEvent: {
            type: 'toolcall_delta',
            toolCall: { id: 'tc-1', name: 'bash', arguments: { command: 'npm test' } },
          },
        }) + '\n',
      ),
    );

    const toolEvents = onEvent.mock.calls.map((c: unknown[]) => c[0] as AgentStreamEvent);
    expect(toolEvents.filter((event) => event.type === 'tool_use')).toEqual([
      { type: 'tool_use', id: 'tc-1', name: 'bash', input: { command: 'npm' } },
    ]);
    expect(toolEvents).toContainEqual({
      type: 'tool_input_delta',
      id: 'tc-1',
      delta: JSON.stringify({ command: 'npm test' }),
    });
  });

  it('tool_execution_end uses cached start input/name when end only contains output', () => {
    const { child, stdout } = makeFakeChild();
    createPiRpcSession({ child, prompt: 'tool', onEvent });

    stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          type: 'tool_execution_start',
          toolCallId: 'cmd-1',
          toolName: 'bash',
          args: { command: 'wc -l original.md' },
        }) + '\n',
      ),
    );
    stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          type: 'tool_execution_end',
          toolCallId: 'cmd-1',
          output: '110 original.md',
        }) + '\n',
      ),
    );

    expect(onEvent).toHaveBeenCalledWith({
      type: 'tool_result',
      toolUseId: 'cmd-1',
      name: 'bash',
      input: { command: 'wc -l original.md' },
      content: '110 original.md',
      isError: false,
    });
  });

  it('file edit results include before/after snapshots when Pi only returns success text', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-edit-snapshot-'));
    try {
      fs.writeFileSync(path.join(tmp, 'original.md'), '原稿', 'utf-8');
      const { child, stdout } = makeFakeChild();
      createPiRpcSession({ child, prompt: 'tool', cwd: tmp, onEvent });

      stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'tool_execution_start',
            toolCallId: 'edit-1',
            toolName: 'edit',
            args: { target: 'original.md' },
          }) + '\n',
        ),
      );

      fs.writeFileSync(path.join(tmp, 'original.md'), '你好，原稿', 'utf-8');

      stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'tool_execution_end',
            toolCallId: 'edit-1',
            output: 'Successfully replaced 1 block(s) in original.md.',
          }) + '\n',
        ),
      );

      expect(onEvent).toHaveBeenCalledWith({
        type: 'tool_result',
        toolUseId: 'edit-1',
        name: 'edit',
        input: {
          target: 'original.md',
          path: 'original.md',
          before: '原稿',
          after: '你好，原稿',
        },
        content: 'Successfully replaced 1 block(s) in original.md.',
        isError: false,
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
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
