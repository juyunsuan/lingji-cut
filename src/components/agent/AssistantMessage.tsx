/**
 * AssistantMessage — 单个 assistant turn 的完整渲染单元。
 *
 * 职责：
 *  - agent 身份头：AgentIcon + agent 名称（turn.agentName ?? 按 agentId 映射 ?? fallbackAgentId ?? '助手'）。
 *  - block 分发：按 block.type 复用现有 TextBlock / ThinkingBlock / ToolCallBlock / ErrorBlock，
 *    与 ConversationDetailPane 现有分发保持一致。
 *  - 权限卡：pendingPermission 存在时在末尾渲染授权请求卡，点击选项调用 onRespondPermission。
 *
 * 抽取自 ConversationDetailPane 的消息渲染逻辑，供 B5 MessageList / B8 ChatPane 复用。
 * 遵守 DESIGN.md：单色系统蓝 accent，复用现有 UI primitives，不自造视觉反馈。
 */

import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '../../ui';
import { AgentIcon } from './AgentIcon';
import { TextBlock } from './TextBlock';
import { ThinkingBlock } from './ThinkingBlock';
import { ErrorBlock } from './ErrorBlock';
import { ToolCallBlock } from './ToolCallBlock';
import type { ConversationTurn, PendingPermission } from '../../types/conversation';

/** agentId → 展示名映射，作为 turn.agentName 缺失时的回退。 */
function agentNameFromId(agentId: string): string {
  const normalized = agentId.toLowerCase().replace(/-acp$/, '');
  switch (normalized) {
    case 'claude':
      return 'Claude';
    case 'codex':
      return 'Codex';
    case 'pi':
      return 'Pi';
    default:
      return '助手';
  }
}

/** 从 ACP 传来的 toolCall 负载里尽力提取可读描述（与 ConversationDetailPane 保持一致）。 */
export function describeToolCall(toolCall: unknown): { title: string; detail?: string } {
  if (!toolCall || typeof toolCall !== 'object') {
    return { title: '未知工具调用' };
  }
  const tc = toolCall as Record<string, unknown>;
  const title =
    (typeof tc.title === 'string' && tc.title) ||
    (typeof tc.name === 'string' && tc.name) ||
    (typeof tc.toolName === 'string' && tc.toolName) ||
    '待授权工具';
  const rawInput = tc.rawInput ?? tc.input;
  let detail: string | undefined;
  if (typeof rawInput === 'string') {
    detail = rawInput;
  } else if (rawInput && typeof rawInput === 'object') {
    try {
      detail = JSON.stringify(rawInput);
    } catch {
      detail = undefined;
    }
  }
  if (detail && detail.length > 160) {
    detail = `${detail.slice(0, 160)}…`;
  }
  return { title, detail };
}

/** 将 ACP 权限选项 kind 映射到按钮 variant（与 ConversationDetailPane 保持一致）。 */
export function variantForKind(kind: string): 'primary' | 'outline' | 'destructive' | 'ghost' {
  if (kind === 'allow_once' || kind === 'allow_always') return 'primary';
  if (kind === 'reject_always') return 'destructive';
  if (kind === 'reject_once') return 'outline';
  return 'ghost';
}

/**
 * 权限请求卡。从 ConversationDetailPane 内联的 PermissionPrompt 抽取为可复用组件，
 * 供 AssistantMessage 末尾渲染（B8 ChatPane 可统一复用此组件）。
 */
export function PermissionPrompt({
  pending,
  onRespond,
}: {
  pending: PendingPermission;
  onRespond: (optionId: string) => void;
}): React.ReactElement {
  const { title, detail } = describeToolCall(pending.toolCall);
  return (
    <div className="mt-2 rounded-[10px] border border-mac-blue/40 bg-mac-blue/10 px-3 py-2.5">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-white">
        <ShieldCheck size={14} className="text-mac-blue" />
        <span>需要你授权工具调用</span>
      </div>
      <div className="mt-1 text-[11px] text-mac-text-muted/80 break-all">{title}</div>
      {detail ? (
        <div className="mt-1 text-[11px] text-mac-text-muted/50 font-mono break-all">
          {detail}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {pending.options.length === 0 ? (
          <div className="text-[11px] text-mac-text-muted/60">没有可用的授权选项</div>
        ) : (
          pending.options.map((option) => (
            <Button
              key={option.optionId}
              size="sm"
              variant={variantForKind(option.kind)}
              onClick={() => onRespond(option.optionId)}
            >
              {option.name}
            </Button>
          ))
        )}
      </div>
    </div>
  );
}

export interface AssistantMessageProps {
  /** 必须为 role === 'assistant' 的 turn */
  turn: ConversationTurn;
  /** 当 turn 自身无 agentId 时使用的会话级 agentType 回退 */
  fallbackAgentId?: string;
  /** 待授权权限（存在则在末尾渲染权限卡） */
  pendingPermission?: PendingPermission | null;
  /** 用户响应权限请求回调 */
  onRespondPermission?: (requestId: string, optionId: string) => void;
}

function AssistantMessageInner({
  turn,
  fallbackAgentId,
  pendingPermission,
  onRespondPermission,
}: AssistantMessageProps): React.ReactElement {
  const agentId = turn.agentId ?? fallbackAgentId ?? 'agent';
  const agentName = turn.agentName ?? agentNameFromId(agentId);

  return (
    <div className="flex flex-col gap-2 max-w-[95%]">
      {/* agent 身份头 */}
      <div className="flex items-center gap-2 text-[11px] font-medium text-mac-text-muted/70">
        <AgentIcon agentId={agentId} size={16} />
        <span>{agentName}</span>
      </div>

      {/* block 分发 */}
      {turn.blocks.map((block, index) => {
        switch (block.type) {
          case 'text':
            return <TextBlock key={index} text={block.text} />;
          case 'thinking':
            return <ThinkingBlock key={index} text={block.text} />;
          case 'error':
            return <ErrorBlock key={index} message={block.message} />;
          case 'tool_call':
            return (
              <ToolCallBlock
                key={index}
                block={{
                  type: 'tool_call',
                  toolCallId: block.toolCallId,
                  title: block.title,
                  kind: block.kind,
                  status: block.status,
                  rawInput: block.rawInput,
                  rawOutput: block.rawOutput,
                }}
              />
            );
          default:
            return null;
        }
      })}

      {/* 权限卡 */}
      {pendingPermission ? (
        <PermissionPrompt
          pending={pendingPermission}
          onRespond={(optionId) =>
            onRespondPermission?.(pendingPermission.requestId, optionId)
          }
        />
      ) : null}
    </div>
  );
}

/**
 * 自定义比较：仅当 turn 引用、fallbackAgentId、pendingPermission 或回调变化时重渲。
 * 流式期间 store 通常替换 turn 引用，这里避免 pendingPermission 不变时全列表抖动。
 */
function areEqual(prev: AssistantMessageProps, next: AssistantMessageProps): boolean {
  return (
    prev.turn === next.turn &&
    prev.fallbackAgentId === next.fallbackAgentId &&
    prev.pendingPermission === next.pendingPermission &&
    prev.onRespondPermission === next.onRespondPermission
  );
}

export const AssistantMessage = React.memo(AssistantMessageInner, areEqual);
AssistantMessage.displayName = 'AssistantMessage';
