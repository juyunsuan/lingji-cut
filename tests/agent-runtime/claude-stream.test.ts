/**
 * tests/agent-runtime/claude-stream.test.ts
 *
 * Unit tests for createClaudeStreamParser — verifies that the Claude CLI
 * stream-json JSONL output is correctly mapped to AgentStreamEvent sequences.
 *
 * All fixtures use real claude CLI field names (snake_case as of 2025).
 */

import { describe, it, expect, vi } from 'vitest';
import { createClaudeStreamParser } from '../../electron/agent-runtime/parsers/claude-stream';
import type { AgentStreamEvent } from '../../electron/agent-runtime/event-model';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Feed a sequence of JSONL objects as newline-delimited text and collect events. */
function runLines(objects: unknown[]): AgentStreamEvent[] {
  const events: AgentStreamEvent[] = [];
  const parser = createClaudeStreamParser((ev) => events.push(ev));
  const jsonl = objects.map((o) => JSON.stringify(o)).join('\n') + '\n';
  parser.feed(jsonl);
  parser.flush();
  return events;
}

/** Feed line by line (simulates per-chunk streaming). */
function runChunked(objects: unknown[]): AgentStreamEvent[] {
  const events: AgentStreamEvent[] = [];
  const parser = createClaudeStreamParser((ev) => events.push(ev));
  for (const o of objects) {
    parser.feed(JSON.stringify(o) + '\n');
  }
  parser.flush();
  return events;
}

// ─── system init ─────────────────────────────────────────────────────────────

describe('system init', () => {
  it('emits status{initializing} with model and sessionId', () => {
    const events = runLines([
      { type: 'system', subtype: 'init', model: 'claude-opus-4', session_id: 'sess-abc' },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'status',
      label: 'initializing',
      model: 'claude-opus-4',
      sessionId: 'sess-abc',
    });
  });

  it('tolerates missing optional fields on init', () => {
    const events = runLines([{ type: 'system', subtype: 'init' }]);
    expect(events[0]).toMatchObject({ type: 'status', label: 'initializing' });
  });

  it('ignores system messages with unknown subtype', () => {
    const events = runLines([{ type: 'system', subtype: 'unknown_subtype' }]);
    // no event emitted for unknown subtypes
    expect(events).toHaveLength(0);
  });
});

// ─── text_delta ───────────────────────────────────────────────────────────────

describe('text_delta', () => {
  it('emits text_delta for each content_block_delta with type text_delta', () => {
    const events = runLines([
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: ', world' } },
    ]);
    expect(events).toEqual([
      { type: 'text_delta', delta: 'Hello' },
      { type: 'text_delta', delta: ', world' },
    ]);
  });

  it('emits text_delta with empty string for missing text', () => {
    const events = runLines([
      { type: 'content_block_delta', delta: { type: 'text_delta' } },
    ]);
    expect(events).toEqual([{ type: 'text_delta', delta: '' }]);
  });
});

// ─── thinking_delta ──────────────────────────────────────────────────────────

describe('thinking_delta', () => {
  it('emits thinking_delta for content_block_delta with type thinking_delta', () => {
    const events = runLines([
      { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'I am reasoning...' } },
    ]);
    expect(events).toEqual([{ type: 'thinking_delta', delta: 'I am reasoning...' }]);
  });

  it('emits empty string when thinking field absent', () => {
    const events = runLines([
      { type: 'content_block_delta', delta: { type: 'thinking_delta' } },
    ]);
    expect(events).toEqual([{ type: 'thinking_delta', delta: '' }]);
  });
});

// ─── tool_use via content_block streaming ────────────────────────────────────

describe('tool_use via content_block streaming', () => {
  /** Minimal streaming sequence for a single tool_use */
  function toolUseStreamSequence(
    id: string,
    name: string,
    inputParts: string[],
  ): unknown[] {
    return [
      { type: 'content_block_start', content_block: { type: 'tool_use', id, name } },
      ...inputParts.map((p) => ({
        type: 'content_block_delta',
        delta: { type: 'input_json_delta', partial_json: p },
      })),
      { type: 'content_block_stop' },
    ];
  }

  it('accumulates input_json_delta fragments and emits tool_use on content_block_stop', () => {
    const events = runLines(toolUseStreamSequence('toolu_1', 'bash', ['{"command":', '"ls -la"}']));
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'tool_use',
      id: 'toolu_1',
      name: 'bash',
      input: { command: 'ls -la' },
    });
  });

  it('handles empty input (no input_json_delta chunks) — defaults to {}', () => {
    const events = runLines([
      { type: 'content_block_start', content_block: { type: 'tool_use', id: 'toolu_2', name: 'noop' } },
      { type: 'content_block_stop' },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'tool_use', id: 'toolu_2', name: 'noop', input: {} });
  });

  it('handles malformed accumulated JSON — defaults to {}', () => {
    const events = runLines([
      { type: 'content_block_start', content_block: { type: 'tool_use', id: 'toolu_3', name: 'bad' } },
      { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{broken' } },
      { type: 'content_block_stop' },
    ]);
    expect(events[0]).toMatchObject({ type: 'tool_use', id: 'toolu_3', input: {} });
  });

  it('works correctly when fed chunk by chunk', () => {
    const events = runChunked(toolUseStreamSequence('toolu_4', 'read_file', ['{"path":"/etc/hosts"}']));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'tool_use', id: 'toolu_4', name: 'read_file' });
  });

  it('registers emitted id in streamedToolUseIds (used by dedup test)', () => {
    // Verifiable indirectly: after streaming, the assistant message wrapping
    // the same id should NOT produce a second tool_use event.
    const sequence = [
      ...toolUseStreamSequence('toolu_5', 'grep', ['{"pattern":"foo"}']),
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'toolu_5', name: 'grep', input: { pattern: 'foo' } }],
          stop_reason: 'tool_use',
        },
      },
    ];
    const events = runLines(sequence);
    const toolUseEvents = events.filter((e) => e.type === 'tool_use');
    // Only one tool_use despite appearing in both paths.
    expect(toolUseEvents).toHaveLength(1);
  });
});

// ─── tool_result ─────────────────────────────────────────────────────────────

describe('tool_result', () => {
  it('emits tool_result for user message with tool_result content block', () => {
    const events = runLines([
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_1',
              content: 'file1.ts\nfile2.ts',
              is_error: false,
            },
          ],
        },
      },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'tool_result',
      toolUseId: 'toolu_1',
      content: 'file1.ts\nfile2.ts',
      isError: false,
    });
  });

  it('sets isError=true when is_error is true', () => {
    const events = runLines([
      {
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_2', content: 'command not found', is_error: true },
          ],
        },
      },
    ]);
    expect(events[0]).toMatchObject({ type: 'tool_result', isError: true });
  });

  it('stringifies array content blocks into text', () => {
    const events = runLines([
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_3',
              content: [{ type: 'text', text: 'hello' }, { type: 'text', text: ' world' }],
            },
          ],
        },
      },
    ]);
    expect(events[0]).toMatchObject({ type: 'tool_result', content: 'hello world' });
  });

  it('handles empty content gracefully', () => {
    const events = runLines([
      {
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_4', content: '' },
          ],
        },
      },
    ]);
    expect(events[0]).toMatchObject({ type: 'tool_result', content: '' });
  });
});

// ─── assistant message ───────────────────────────────────────────────────────

describe('assistant message', () => {
  it('emits turn_end when stop_reason is end_turn', () => {
    const events = runLines([
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Done!' }],
          stop_reason: 'end_turn',
        },
      },
    ]);
    expect(events).toEqual([{ type: 'turn_end', stopReason: 'end_turn' }]);
  });

  it('does NOT emit turn_end when stop_reason is tool_use (turn continues)', () => {
    const events = runLines([
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'toolu_99', name: 'bash', input: {} }],
          stop_reason: 'tool_use',
        },
      },
    ]);
    const turnEndEvents = events.filter((e) => e.type === 'turn_end');
    expect(turnEndEvents).toHaveLength(0);
  });

  it('emits tool_use from assistant message when not previously streamed', () => {
    const events = runLines([
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'toolu_100', name: 'grep', input: { pattern: 'bar' } }],
          stop_reason: 'tool_use',
        },
      },
    ]);
    expect(events).toEqual([
      { type: 'tool_use', id: 'toolu_100', name: 'grep', input: { pattern: 'bar' } },
    ]);
  });

  it('does not emit turn_end when stop_reason is absent', () => {
    const events = runLines([
      {
        type: 'assistant',
        message: { content: [] },
      },
    ]);
    expect(events.filter((e) => e.type === 'turn_end')).toHaveLength(0);
  });
});

// ─── result (usage) ──────────────────────────────────────────────────────────

describe('result → usage', () => {
  it('emits usage with inputTokens, outputTokens, costUsd, durationMs', () => {
    const events = runLines([
      {
        type: 'result',
        usage: { input_tokens: 512, output_tokens: 128 },
        total_cost_usd: 0.0012,
        duration_ms: 3500,
      },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'usage',
      inputTokens: 512,
      outputTokens: 128,
      costUsd: 0.0012,
      durationMs: 3500,
    });
  });

  it('tolerates missing optional cost/duration fields', () => {
    const events = runLines([
      { type: 'result', usage: { input_tokens: 10, output_tokens: 5 } },
    ]);
    expect(events[0]).toEqual({
      type: 'usage',
      inputTokens: 10,
      outputTokens: 5,
      costUsd: undefined,
      durationMs: undefined,
    });
  });

  it('tolerates missing usage object entirely', () => {
    const events = runLines([{ type: 'result' }]);
    expect(events[0]).toMatchObject({ type: 'usage' });
  });
});

// ─── tool_use deduplication ──────────────────────────────────────────────────

describe('tool_use deduplication', () => {
  it('emits tool_use only once when content_block streaming and assistant wrapper both present', () => {
    const events = runLines([
      // 1. content_block streaming path
      { type: 'content_block_start', content_block: { type: 'tool_use', id: 'dedup-1', name: 'write_file' } },
      { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"path":"a.ts","content":"x"}' } },
      { type: 'content_block_stop' },
      // 2. user provides tool result
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'dedup-1', content: 'ok', is_error: false }],
        },
      },
      // 3. assistant wrapper re-lists the same tool_use (duplicate)
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'dedup-1', name: 'write_file', input: { path: 'a.ts', content: 'x' } }],
          stop_reason: 'tool_use',
        },
      },
    ]);

    const toolUseEvents = events.filter((e) => e.type === 'tool_use');
    expect(toolUseEvents).toHaveLength(1);
    expect(toolUseEvents[0]).toMatchObject({ id: 'dedup-1' });
  });

  it('emits two tool_use events when two distinct ids are streamed', () => {
    const events = runLines([
      { type: 'content_block_start', content_block: { type: 'tool_use', id: 'dup-a', name: 'read' } },
      { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{}' } },
      { type: 'content_block_stop' },
      { type: 'content_block_start', content_block: { type: 'tool_use', id: 'dup-b', name: 'write' } },
      { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{}' } },
      { type: 'content_block_stop' },
    ]);
    const toolUseEvents = events.filter((e) => e.type === 'tool_use');
    expect(toolUseEvents).toHaveLength(2);
    expect(toolUseEvents[0]).toMatchObject({ id: 'dup-a' });
    expect(toolUseEvents[1]).toMatchObject({ id: 'dup-b' });
  });
});

// ─── full representative turn sequence ───────────────────────────────────────

describe('full representative turn', () => {
  it('emits correct event sequence for init→text→tool→result→turn_end', () => {
    const objects: unknown[] = [
      // init
      { type: 'system', subtype: 'init', model: 'claude-opus-4', session_id: 's-1' },
      // text delta
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Let me check that.' } },
      // tool_use via streaming
      { type: 'content_block_start', content_block: { type: 'tool_use', id: 't-1', name: 'bash' } },
      { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"cmd":"ls"}' } },
      { type: 'content_block_stop' },
      // assistant wrapping (stop_reason=tool_use — no turn_end)
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Let me check that.' },
            { type: 'tool_use', id: 't-1', name: 'bash', input: { cmd: 'ls' } },
          ],
          stop_reason: 'tool_use',
        },
      },
      // tool result
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 't-1', content: 'file.ts', is_error: false }],
        },
      },
      // result
      {
        type: 'result',
        usage: { input_tokens: 200, output_tokens: 50 },
        total_cost_usd: 0.0005,
        duration_ms: 1200,
      },
      // final assistant message
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Done.' }],
          stop_reason: 'end_turn',
        },
      },
    ];

    const events = runLines(objects);

    // Check order / types
    const types = events.map((e) => e.type);
    expect(types).toEqual([
      'status',       // init
      'text_delta',   // content block delta
      'tool_use',     // content_block_stop (streamed path)
      // assistant wrapper with stop_reason=tool_use: dedup skips tool_use, no turn_end
      'tool_result',  // user message
      'usage',        // result
      'turn_end',     // final assistant stop_reason=end_turn
    ]);

    expect(events[0]).toMatchObject({ type: 'status', label: 'initializing', model: 'claude-opus-4' });
    expect(events[1]).toMatchObject({ type: 'text_delta', delta: 'Let me check that.' });
    expect(events[2]).toMatchObject({ type: 'tool_use', id: 't-1', name: 'bash', input: { cmd: 'ls' } });
    expect(events[3]).toMatchObject({ type: 'tool_result', toolUseId: 't-1', content: 'file.ts' });
    expect(events[4]).toMatchObject({ type: 'usage', inputTokens: 200, outputTokens: 50 });
    expect(events[5]).toMatchObject({ type: 'turn_end', stopReason: 'end_turn' });
  });
});

// ─── raw / unknown lines ─────────────────────────────────────────────────────

describe('raw / unknown lines', () => {
  it('emits raw event for non-JSON text lines', () => {
    const events: AgentStreamEvent[] = [];
    const parser = createClaudeStreamParser((ev) => events.push(ev));
    parser.feed('not-json-at-all\n');
    parser.flush();
    expect(events).toEqual([{ type: 'raw', line: 'not-json-at-all' }]);
  });

  it('ignores unknown JSON message types without crashing', () => {
    const events = runLines([
      { type: 'ping' },
      { type: 'unknown_future_event', data: {} },
    ]);
    // unknown types produce no events
    expect(events).toHaveLength(0);
  });

  it('handles Buffer input identically to string input', () => {
    const events: AgentStreamEvent[] = [];
    const parser = createClaudeStreamParser((ev) => events.push(ev));
    parser.feed(Buffer.from(JSON.stringify({ type: 'system', subtype: 'init', model: 'm' }) + '\n'));
    parser.flush();
    expect(events[0]).toMatchObject({ type: 'status', label: 'initializing', model: 'm' });
  });
});
