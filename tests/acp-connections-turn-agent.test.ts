import { describe, expect, it } from 'vitest';
import type { ConversationConnectionState } from '../src/types/conversation';
import { buildAssistantTurnInput } from '../src/contexts/acp-connections-context';

function buildConnection(agentType: string): ConversationConnectionState {
  return {
    conversationId: 1,
    agentType,
    status: 'connected',
    sessionId: 'session-1',
    liveMessage: {
      id: 'm-1',
      role: 'assistant',
      content: [{ type: 'text', text: '回复内容' }],
      startedAt: 0,
    },
    pendingPermission: null,
    usage: null,
    availableCommands: null,
    configOptions: null,
    availableModes: null,
    currentModeId: null,
    models: null,
    error: null,
  };
}

describe('buildAssistantTurnInput', () => {
  it('为 assistant turn 带上来自连接 agentType 的 agentId 与展示名', () => {
    const connection = buildConnection('codex');
    const input = buildAssistantTurnInput(connection, { stopReason: 'end_turn' });

    expect(input.role).toBe('assistant');
    expect(input.agentId).toBe('codex');
    // 展示名来自 agent-presentation（runtime registry：codex -> 'Codex'）
    expect(input.agentName).toBe('Codex');
  });

  it('claude 连接归属为 claude / Claude Code，并附带 turn_complete 块与 usage', () => {
    const connection = buildConnection('claude');
    const usage = JSON.stringify({ inputTokens: 10 });
    const input = buildAssistantTurnInput(connection, {
      stopReason: 'max_tokens',
      sessionStatsJson: usage,
    });

    expect(input.agentId).toBe('claude');
    expect(input.agentName).toBe('Claude Code');
    expect(input.sessionStatsJson).toBe(usage);
    // 持久化的 blocks = liveMessage 内容 + turn_complete 收尾块
    expect(input.blocks).toEqual([
      { type: 'text', text: '回复内容' },
      { type: 'turn_complete', stopReason: 'max_tokens' },
    ]);
  });

  it('未知 agentType 回退到默认 agent 展示名（不丢失 per-turn agentId）', () => {
    const connection = buildConnection('unknown-agent');
    const input = buildAssistantTurnInput(connection, { stopReason: 'end_turn' });

    // agentId 保留原始连接值，便于排查；展示名回退默认 agent
    expect(input.agentId).toBe('unknown-agent');
    expect(input.agentName).toBe('Claude Code');
  });

  it('可用会话 agentType 兜底覆盖默认 claude，避免 Pi turn 被持久化成 Claude Code', () => {
    const connection = buildConnection('claude');
    const input = buildAssistantTurnInput(connection, {
      stopReason: 'end_turn',
      fallbackAgentType: 'pi',
    });

    expect(input.agentId).toBe('pi');
    expect(input.agentName).toBe('Pi');
  });
});
