/**
 * tests/agent-runtime/event-model.test.ts
 *
 * 测试 AgentStreamEvent → RuntimeEventOut 的归一化映射。
 * 断言输出字段与 applyRuntimeEvent() 实际消费字段完全一致
 * （调研来源：src/contexts/acp-connections-context.tsx）。
 */

import { describe, it, expect } from 'vitest';
import { toRuntimeEvent } from '../../electron/agent-runtime/event-model';
import type { AgentStreamEvent, RuntimeEventOut } from '../../electron/agent-runtime/event-model';

// ─── 辅助 ─────────────────────────────────────────────────────────────────────

function mapEvent(ev: AgentStreamEvent): RuntimeEventOut | null {
  return toRuntimeEvent(ev);
}

// ─── text_delta ───────────────────────────────────────────────────────────────

describe('text_delta', () => {
  it('maps to { type:"text", text } — consumed by case "text"|"content_delta"', () => {
    const result = mapEvent({ type: 'text_delta', delta: 'hello world' });
    expect(result).toEqual({ type: 'text', text: 'hello world' });
  });

  it('preserves empty delta', () => {
    const result = mapEvent({ type: 'text_delta', delta: '' });
    expect(result).toEqual({ type: 'text', text: '' });
  });
});

// ─── thinking_delta ───────────────────────────────────────────────────────────

describe('thinking_delta', () => {
  it('maps to { type:"thinking", text } — consumed by case "thinking"', () => {
    const result = mapEvent({ type: 'thinking_delta', delta: 'I am thinking...' });
    expect(result).toEqual({ type: 'thinking', text: 'I am thinking...' });
  });
});

// ─── tool_use ─────────────────────────────────────────────────────────────────

describe('tool_use', () => {
  it('maps to tool_call with correct top-level fields (toolCallId / title / kind / status / rawInput)', () => {
    const result = mapEvent({
      type: 'tool_use',
      id: 'call-123',
      name: 'bash',
      input: { command: 'ls -la' },
    });
    expect(result).toEqual({
      type: 'tool_call',
      toolCallId: 'call-123',
      title: 'bash',
      kind: 'other',
      status: 'pending',
      rawInput: JSON.stringify({ command: 'ls -la' }),
    });
  });

  it('handles null input gracefully', () => {
    const result = mapEvent({ type: 'tool_use', id: 'call-0', name: 'noop', input: null });
    expect(result).toEqual({
      type: 'tool_call',
      toolCallId: 'call-0',
      title: 'noop',
      kind: 'other',
      status: 'pending',
      rawInput: 'null',
    });
  });

  it('handles undefined input (maps to null)', () => {
    const result = mapEvent({ type: 'tool_use', id: 'call-1', name: 'ping', input: undefined });
    expect(result).toEqual({
      type: 'tool_call',
      toolCallId: 'call-1',
      title: 'ping',
      kind: 'other',
      status: 'pending',
      rawInput: 'null',
    });
  });
});

// ─── tool_result ──────────────────────────────────────────────────────────────

describe('tool_result', () => {
  it('maps successful result to tool_call_update with status=completed', () => {
    const result = mapEvent({
      type: 'tool_result',
      toolUseId: 'call-123',
      content: 'file1.ts\nfile2.ts',
    });
    expect(result).toEqual({
      type: 'tool_call_update',
      toolCallId: 'call-123',
      status: 'completed',
      rawOutput: 'file1.ts\nfile2.ts',
      rawOutputAppend: false,
    });
  });

  it('maps error result to tool_call_update with status=error', () => {
    const result = mapEvent({
      type: 'tool_result',
      toolUseId: 'call-456',
      content: 'command not found',
      isError: true,
    });
    expect(result).toEqual({
      type: 'tool_call_update',
      toolCallId: 'call-456',
      status: 'error',
      rawOutput: 'command not found',
      rawOutputAppend: false,
    });
  });

  it('defaults isError=false (status=completed) when not provided', () => {
    const result = mapEvent({
      type: 'tool_result',
      toolUseId: 'call-789',
      content: 'ok',
    });
    expect(result).toMatchObject({ status: 'completed' });
  });
});

// ─── turn_end ─────────────────────────────────────────────────────────────────

describe('turn_end', () => {
  it('maps to turn_complete with stopReason', () => {
    const result = mapEvent({ type: 'turn_end', stopReason: 'end_turn' });
    expect(result).toEqual({ type: 'turn_complete', stopReason: 'end_turn' });
  });

  it('maps turn_end with no stopReason (undefined)', () => {
    const result = mapEvent({ type: 'turn_end' });
    expect(result).toEqual({ type: 'turn_complete', stopReason: undefined });
  });
});

// ─── error ────────────────────────────────────────────────────────────────────

describe('error', () => {
  it('maps to { type:"error", message } — consumed by case "error"', () => {
    const result = mapEvent({ type: 'error', message: 'Connection refused' });
    expect(result).toEqual({ type: 'error', message: 'Connection refused' });
  });

  it('raw field is not forwarded (not consumed by applyRuntimeEvent)', () => {
    const result = mapEvent({ type: 'error', message: 'oops', raw: '{"code":500}' });
    expect(result).toEqual({ type: 'error', message: 'oops' });
    // raw is not part of RuntimeEventOut
    expect((result as Record<string, unknown>)['raw']).toBeUndefined();
  });
});

// ─── usage ────────────────────────────────────────────────────────────────────

describe('usage', () => {
  it('maps outputTokens to used; size defaults to 0 (no context-window info)', () => {
    const result = mapEvent({
      type: 'usage',
      inputTokens: 100,
      outputTokens: 250,
      costUsd: 0.003,
    });
    // applyRuntimeEvent case 'usage': { used: number; size: number }
    expect(result).toEqual({ type: 'usage', used: 250, size: 0 });
  });

  it('used defaults to 0 when outputTokens is absent', () => {
    const result = mapEvent({ type: 'usage' });
    expect(result).toEqual({ type: 'usage', used: 0, size: 0 });
  });

  it('used defaults to 0 when outputTokens is explicitly undefined', () => {
    const result = mapEvent({ type: 'usage', outputTokens: undefined });
    expect(result).toEqual({ type: 'usage', used: 0, size: 0 });
  });
});

// ─── null 分支（首版不映射） ──────────────────────────────────────────────────

describe('null branches (unmapped in v1)', () => {
  it('status → null', () => {
    expect(mapEvent({ type: 'status', label: 'connecting' })).toBeNull();
  });

  it('status with all optional fields → null', () => {
    expect(
      mapEvent({ type: 'status', label: 'running', detail: 'ok', model: 'claude-3-5', sessionId: 's1' }),
    ).toBeNull();
  });

  it('thinking_start → null', () => {
    expect(mapEvent({ type: 'thinking_start' })).toBeNull();
  });

  it('thinking_end → null', () => {
    expect(mapEvent({ type: 'thinking_end' })).toBeNull();
  });

  it('tool_input_delta → null', () => {
    expect(mapEvent({ type: 'tool_input_delta', id: 'call-1', delta: '{"q' })).toBeNull();
  });

  it('raw → null', () => {
    expect(mapEvent({ type: 'raw', line: 'data: {"type":"ping"}' })).toBeNull();
  });
});

// ─── 返回值类型完整性断言 ─────────────────────────────────────────────────────

describe('return type completeness', () => {
  it('all mapped events return non-null objects with a type field', () => {
    const mapped = [
      mapEvent({ type: 'text_delta', delta: 'x' }),
      mapEvent({ type: 'thinking_delta', delta: 'x' }),
      mapEvent({ type: 'tool_use', id: 'id', name: 'fn', input: {} }),
      mapEvent({ type: 'tool_result', toolUseId: 'id', content: 'out' }),
      mapEvent({ type: 'turn_end' }),
      mapEvent({ type: 'error', message: 'err' }),
      mapEvent({ type: 'usage', outputTokens: 10 }),
    ];
    for (const r of mapped) {
      expect(r).not.toBeNull();
      expect(typeof (r as RuntimeEventOut).type).toBe('string');
    }
  });
});
