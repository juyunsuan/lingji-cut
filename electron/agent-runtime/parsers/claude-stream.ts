/**
 * claude-stream.ts
 *
 * Parser for Claude CLI `--output-format stream-json` (JSONL).
 *
 * Each newline-delimited JSON object emitted by the claude CLI is routed to
 * the appropriate AgentStreamEvent via the mapping table below.
 *
 * Claude stream-json message types (2025 convention, snake_case fields):
 *
 *   {type:'system', subtype:'init', model, session_id}
 *   {type:'content_block_start', content_block:{type:'text'|'thinking'|'tool_use', id?, name?}}
 *   {type:'content_block_delta', delta:{type:'text_delta'|'thinking_delta'|'input_json_delta', text?, thinking?, partial_json?}}
 *   {type:'content_block_stop'}
 *   {type:'assistant', message:{content:[...], stop_reason?}}
 *   {type:'user', message:{content:[{type:'tool_result', tool_use_id, content, is_error?}]}}
 *   {type:'result', usage:{input_tokens, output_tokens}, total_cost_usd?, duration_ms?}
 */

import { createJsonLineStream } from './line-stream';
import type { AgentStreamEvent } from '../event-model';

interface PendingTool {
  id: string;
  name: string;
  /** Accumulated partial_json fragments */
  inputJson: string;
}

/**
 * Stringify tool_result content — it may be a plain string or an array of
 * content blocks such as [{type:'text', text:'…'}].
 */
function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const block = item as Record<string, unknown>;
          if (typeof block['text'] === 'string') return block['text'];
          return JSON.stringify(item);
        }
        return String(item);
      })
      .join('');
  }
  if (content == null) return '';
  return JSON.stringify(content);
}

export function createClaudeStreamParser(
  onEvent: (ev: AgentStreamEvent) => void,
): { feed(chunk: string | Buffer): void; flush(): void } {
  /** Tool use currently being streamed via content_block_start / content_block_delta / content_block_stop */
  let pendingTool: PendingTool | null = null;

  /**
   * IDs of tool_use events already emitted via the content_block streaming
   * path.  When the wrapper `{type:'assistant'}` message arrives later it
   * may re-list the same tool_use blocks; we skip those to avoid duplicates.
   */
  const streamedToolUseIds = new Set<string>();

  function handleJson(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return;
    const msg = obj as Record<string, unknown>;
    const msgType = msg['type'] as string | undefined;

    // ── init ────────────────────────────────────────────────────────────────
    if (msgType === 'system') {
      const subtype = msg['subtype'] as string | undefined;
      if (subtype === 'init') {
        onEvent({
          type: 'status',
          label: 'initializing',
          model: msg['model'] as string | undefined,
          sessionId: msg['session_id'] as string | undefined,
        });
      }
      return;
    }

    // ── content_block_start ─────────────────────────────────────────────────
    if (msgType === 'content_block_start') {
      const cb = msg['content_block'] as Record<string, unknown> | undefined;
      if (!cb) return;
      const cbType = cb['type'] as string | undefined;
      if (cbType === 'tool_use') {
        pendingTool = {
          id: (cb['id'] as string) ?? '',
          name: (cb['name'] as string) ?? '',
          inputJson: '',
        };
      }
      // text / thinking blocks — no specific start event required
      return;
    }

    // ── content_block_delta ─────────────────────────────────────────────────
    if (msgType === 'content_block_delta') {
      const delta = msg['delta'] as Record<string, unknown> | undefined;
      if (!delta) return;
      const deltaType = delta['type'] as string | undefined;

      if (deltaType === 'text_delta') {
        const text = delta['text'];
        onEvent({ type: 'text_delta', delta: typeof text === 'string' ? text : '' });
        return;
      }

      if (deltaType === 'thinking_delta') {
        const thinking = delta['thinking'];
        onEvent({ type: 'thinking_delta', delta: typeof thinking === 'string' ? thinking : '' });
        return;
      }

      if (deltaType === 'input_json_delta') {
        const partial = delta['partial_json'];
        if (typeof partial === 'string' && pendingTool) {
          pendingTool.inputJson += partial;
        }
        return;
      }

      return;
    }

    // ── content_block_stop ──────────────────────────────────────────────────
    if (msgType === 'content_block_stop') {
      if (pendingTool) {
        let parsedInput: unknown = {};
        try {
          parsedInput = JSON.parse(pendingTool.inputJson);
        } catch {
          parsedInput = {};
        }
        onEvent({
          type: 'tool_use',
          id: pendingTool.id,
          name: pendingTool.name,
          input: parsedInput,
        });
        streamedToolUseIds.add(pendingTool.id);
        pendingTool = null;
      }
      return;
    }

    // ── user message (tool_result) ──────────────────────────────────────────
    if (msgType === 'user') {
      const userMsg = msg['message'] as Record<string, unknown> | undefined;
      const content = userMsg?.['content'];
      if (Array.isArray(content)) {
        for (const item of content) {
          if (!item || typeof item !== 'object') continue;
          const block = item as Record<string, unknown>;
          if (block['type'] === 'tool_result') {
            onEvent({
              type: 'tool_result',
              toolUseId: (block['tool_use_id'] as string) ?? '',
              content: stringifyContent(block['content']),
              isError: block['is_error'] === true,
            });
          }
        }
      }
      return;
    }

    // ── assistant message (may re-list tool_use blocks) ─────────────────────
    if (msgType === 'assistant') {
      const assistantMsg = msg['message'] as Record<string, unknown> | undefined;
      const content = assistantMsg?.['content'];
      const stopReason = assistantMsg?.['stop_reason'] as string | undefined;

      if (Array.isArray(content)) {
        for (const item of content) {
          if (!item || typeof item !== 'object') continue;
          const block = item as Record<string, unknown>;
          if (block['type'] === 'tool_use') {
            const id = (block['id'] as string) ?? '';
            if (streamedToolUseIds.has(id)) {
              // Already emitted via content_block streaming — deduplicate.
              streamedToolUseIds.delete(id);
              continue;
            }
            // Emitted without prior streaming (non-streaming path).
            let parsedInput: unknown = {};
            try {
              const rawInput = block['input'];
              parsedInput = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput ?? {};
            } catch {
              parsedInput = {};
            }
            onEvent({
              type: 'tool_use',
              id,
              name: (block['name'] as string) ?? '',
              input: parsedInput,
            });
          }
        }
      }

      // Emit turn_end unless the turn ended because of a pending tool_use
      // (the turn continues when the result arrives).
      if (stopReason && stopReason !== 'tool_use') {
        onEvent({ type: 'turn_end', stopReason });
      }
      return;
    }

    // ── result (usage / cost / duration) ───────────────────────────────────
    if (msgType === 'result') {
      const usage = msg['usage'] as Record<string, unknown> | undefined;
      onEvent({
        type: 'usage',
        inputTokens:
          typeof usage?.['input_tokens'] === 'number' ? (usage['input_tokens'] as number) : undefined,
        outputTokens:
          typeof usage?.['output_tokens'] === 'number' ? (usage['output_tokens'] as number) : undefined,
        costUsd:
          typeof msg['total_cost_usd'] === 'number' ? (msg['total_cost_usd'] as number) : undefined,
        durationMs:
          typeof msg['duration_ms'] === 'number' ? (msg['duration_ms'] as number) : undefined,
      });
      return;
    }
  }

  const lineStream = createJsonLineStream({
    onJson: handleJson,
    onRaw: (line) => onEvent({ type: 'raw', line }),
  });

  return {
    feed(chunk: string | Buffer): void {
      lineStream.feed(chunk);
    },
    flush(): void {
      lineStream.flush();
    },
  };
}
