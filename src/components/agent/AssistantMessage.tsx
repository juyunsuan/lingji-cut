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
import { CopyButton } from './CopyButton';
import { TextBlock } from './TextBlock';
import { ThinkingBlock } from './ThinkingBlock';
import { ErrorBlock } from './ErrorBlock';
import { ToolCallBlock } from './ToolCallBlock';
import { ToolGroupBlock } from './ToolGroupBlock';
import { FileChangedBlock } from './FileChangedBlock';
import { describeToolCallBlock, fileChangeFromToolCall } from './tool-call-descriptor';
import type { ConversationBlock, ConversationTurn, PendingPermission } from '../../types/conversation';

type ToolCallBlockData = Extract<ConversationBlock, { type: 'tool_call' }>;
type FileChangedBlockData = Extract<ConversationBlock, { type: 'file_changed' }>;

/** 把 ConversationBlock 中的 tool_call 收窄为 ToolCallBlock 接收的形状。 */
function toToolCallProps(block: ToolCallBlockData) {
  return {
    type: 'tool_call' as const,
    toolCallId: block.toolCallId,
    title: block.title,
    kind: block.kind,
    status: block.status,
    rawInput: block.rawInput,
    rawOutput: block.rawOutput,
  };
}

function canGroupToolCalls(a: ToolCallBlockData, b: ToolCallBlockData): boolean {
  const da = describeToolCallBlock(toToolCallProps(a));
  const db = describeToolCallBlock(toToolCallProps(b));
  if (da.category === 'command' && db.category === 'command') return true;
  if (a.title === b.title) return true;
  return false;
}

export function renderBlocks(
  blocks: ConversationBlock[],
  opts: { isLastAssistant?: boolean; isStreaming?: boolean } = {},
): React.ReactNode[] {
  // 仅「最新一条 assistant 消息中的最后一个 thinking 块」算作最新：默认展开实时查看，
  // 其余历史 thinking 折叠，避免推理内容堆叠占屏。
  let lastThinkingIndex = -1;
  if (opts.isLastAssistant) {
    for (let k = blocks.length - 1; k >= 0; k -= 1) {
      if (blocks[k].type === 'thinking') {
        lastThinkingIndex = k;
        break;
      }
    }
  }

  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type !== 'tool_call') {
      if (block.type === 'file_changed') {
        const group: FileChangedBlockData[] = [];
        let j = i;
        while (j < blocks.length && blocks[j].type === 'file_changed') {
          group.push(blocks[j] as FileChangedBlockData);
          j += 1;
        }
        out.push(<FileChangedBlock key={`files-${i}`} files={group} />);
        i = j;
        continue;
      }

      switch (block.type) {
        case 'text':
          out.push(<TextBlock key={i} text={block.text} />);
          break;
        case 'thinking': {
          const isLatest = i === lastThinkingIndex;
          out.push(
            <ThinkingBlock
              key={i}
              text={block.text}
              isLatest={isLatest}
              streaming={isLatest && Boolean(opts.isStreaming)}
            />,
          );
          break;
        }
        case 'error':
          out.push(<ErrorBlock key={i} message={block.message} />);
          break;
        default:
          break;
      }
      i += 1;
      continue;
    }

    // 连续的 edit/write/delete 工具调用在最外层提升为文件变更块，避免埋在普通工具调用里。
    const group: ToolCallBlockData[] = [];
    let j = i;
    const firstFileChange = fileChangeFromToolCall(toToolCallProps(block));
    if (firstFileChange) {
      const files = [];
      while (j < blocks.length && blocks[j].type === 'tool_call') {
        const file = fileChangeFromToolCall(toToolCallProps(blocks[j] as ToolCallBlockData));
        if (!file) break;
        files.push({ type: 'file_changed' as const, ...file });
        j += 1;
      }
      out.push(<FileChangedBlock key={`tool-files-${i}`} files={files} />);
      i = j;
      continue;
    }

    group.push(block);
    j = i + 1;
    while (j < blocks.length) {
      const b = blocks[j];
      if (b.type !== 'tool_call' || !canGroupToolCalls(group[group.length - 1], b)) break;
      group.push(b);
      j += 1;
    }

    if (group.length >= 2) {
      out.push(<ToolGroupBlock key={`group-${i}`} blocks={group.map(toToolCallProps)} />);
    } else {
      out.push(<ToolCallBlock key={i} block={toToolCallProps(group[0])} />);
    }
    i = j;
  }
  return out;
}

function copyableText(turn: ConversationTurn): string {
  return turn.blocks
    .filter((block): block is Extract<ConversationBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n')
    .trim();
}

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
  /** 是否为最新一条 assistant 消息（决定其最后一个 thinking 是否默认展开）。 */
  isLastAssistant?: boolean;
  /** 是否处于流式输出中（用于最新 thinking 的「推理中」视觉）。 */
  isStreaming?: boolean;
}

function AssistantMessageInner({
  turn,
  fallbackAgentId,
  pendingPermission,
  onRespondPermission,
  isLastAssistant,
  isStreaming,
}: AssistantMessageProps): React.ReactElement {
  const agentId = turn.agentId ?? fallbackAgentId ?? 'agent';
  const agentName = turn.agentName ?? agentNameFromId(agentId);
  const copyText = copyableText(turn);

  return (
    // group：用于在 hover 时提亮复制按钮。
    // userSelect:text + cursor:auto：显式允许鼠标拖拽选中消息文本并手动复制，
    // 不受外层可能继承的 user-select:none 影响。
    <div
      className="group flex flex-col gap-2 max-w-[95%]"
      style={{ userSelect: 'text', WebkitUserSelect: 'text', cursor: 'auto' }}
    >
      {/* agent 身份头 + 复制按钮 */}
      <div className="flex items-center gap-2 text-[11px] font-medium text-mac-text-muted/70">
        <AgentIcon agentId={agentId} size={16} />
        <span>{agentName}</span>
        {copyText ? (
          <CopyButton
            text={copyText}
            label="复制回复"
            className="ml-auto opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
          />
        ) : null}
      </div>

      {/* block 分发（连续同名 tool_call 聚合为 ToolGroupBlock） */}
      {renderBlocks(turn.blocks, { isLastAssistant, isStreaming })}

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
    prev.onRespondPermission === next.onRespondPermission &&
    prev.isLastAssistant === next.isLastAssistant &&
    prev.isStreaming === next.isStreaming
  );
}

export const AssistantMessage = React.memo(AssistantMessageInner, areEqual);
AssistantMessage.displayName = 'AssistantMessage';
