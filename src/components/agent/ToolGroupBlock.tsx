import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  Search,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import { ToolCallBlock } from './ToolCallBlock';
import { describeToolCallBlock, type ToolCallDescriptor } from './tool-call-descriptor';
import styles from './AgentTranscript.module.css';

interface ToolCallBlockType {
  type: 'tool_call';
  toolCallId?: string;
  title?: string;
  kind?: string;
  status?: string;
  rawInput?: string;
  rawOutput?: string;
}

type GroupStatusKind = 'running' | 'ok' | 'error';

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function classifyStatus(status?: string): GroupStatusKind {
  const s = textValue(status).toLowerCase();
  if (s === 'completed' || s === 'done' || s === 'success' || s === 'ok') return 'ok';
  if (s === 'failed' || s === 'error') return 'error';
  return 'running';
}

export function aggregateStatus(blocks: ToolCallBlockType[]): GroupStatusKind {
  let hasError = false;
  for (const block of blocks) {
    const kind = classifyStatus(block.status);
    if (kind === 'running') return 'running';
    if (kind === 'error') hasError = true;
  }
  return hasError ? 'error' : 'ok';
}

function isCommandGroup(blocks: ToolCallBlockType[]): boolean {
  return blocks.some((block) => describeToolCallBlock(block).category === 'command');
}

function groupTitle(blocks: ToolCallBlockType[]): string {
  const first = blocks[0];
  if (!first) return '工具调用';
  return describeToolCallBlock(first).label;
}

function groupStatusLabel(kind: GroupStatusKind, commandLike: boolean): string {
  if (kind === 'running') return commandLike ? '执行中' : '运行中';
  if (kind === 'error') return commandLike ? '执行失败' : '调用失败';
  return commandLike ? '已执行' : '已完成';
}

function commandGroupLabel(kind: GroupStatusKind, count: number): string {
  if (kind === 'running') return `正在运行 ${count} 条命令`;
  if (kind === 'error') return `${count} 条命令执行失败`;
  return `已运行 ${count} 条命令`;
}

function GroupIcon({ descriptor }: { descriptor: ToolCallDescriptor | null }) {
  if (!descriptor) return <Wrench size={14} strokeWidth={1.8} />;
  if (descriptor.category === 'command') return <Terminal size={14} strokeWidth={1.8} />;
  if (descriptor.category === 'edit' || descriptor.category === 'write' || descriptor.category === 'delete') {
    return <Pencil size={14} strokeWidth={1.8} />;
  }
  if (descriptor.category === 'read' || descriptor.category === 'search') {
    return <Search size={14} strokeWidth={1.8} />;
  }
  return <Wrench size={14} strokeWidth={1.8} />;
}

function GroupStatusIcon({ kind }: { kind: GroupStatusKind }) {
  if (kind === 'ok') return <Check size={14} strokeWidth={2} aria-label="已完成" />;
  if (kind === 'error') return <X size={14} strokeWidth={2} aria-label="失败" />;
  return <span aria-label="运行中" className="inline-block h-2 w-2 rounded-full bg-mac-blue animate-pulse" />;
}

function shellText(block: ToolCallBlockType): string {
  const descriptor = describeToolCallBlock(block);
  const command = descriptor.category === 'command' ? descriptor.subject : '';
  const output = block.rawOutput?.trimEnd() || '(no output)';
  return command ? `$ ${command}\n${output}` : output;
}

function CommandGroupDetails({ blocks }: { blocks: ToolCallBlockType[] }) {
  const shell = blocks.map(shellText).join('\n\n');
  return (
    <div className={styles.commandGroupDetails}>
      <div className={styles.detailLabel}>Shell</div>
      <pre className={`${styles.detailPre} ${styles.detailShell} ${styles.commandGroupShell}`}>{shell}</pre>
    </div>
  );
}

export function ToolGroupBlock({ blocks }: { blocks: ToolCallBlockType[] }) {
  const statusKind = aggregateStatus(blocks);
  const commandLike = isCommandGroup(blocks);
  const firstDescriptor = blocks[0] ? describeToolCallBlock(blocks[0]) : null;
  const title = groupTitle(blocks);
  const [expanded, setExpanded] = useState(statusKind === 'error');
  const statusClass =
    statusKind === 'error'
      ? styles.eventStatusError
      : statusKind === 'ok'
        ? styles.eventStatusOk
        : '';

  return (
    <div className={styles.event}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={`${styles.eventHeader} ${styles.eventHeaderInteractive}`}
        aria-expanded={expanded}
      >
        <span className={styles.eventIcon}>
          <GroupIcon descriptor={firstDescriptor} />
        </span>
        {commandLike ? (
          <span className={`${styles.eventLabel} ${statusClass}`}>
            {commandGroupLabel(statusKind, blocks.length)}
          </span>
        ) : (
          <>
            <span className={styles.eventLabel}>{title}</span>
            <span className={`${styles.eventStatus} ${statusClass}`}>
              <GroupStatusIcon kind={statusKind} /> {groupStatusLabel(statusKind, commandLike)}
            </span>
            <span className={styles.eventTitle}>{blocks.length} 次调用</span>
          </>
        )}
        <span className={styles.eventChevron} aria-hidden>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {expanded ? (
        commandLike ? (
          <CommandGroupDetails blocks={blocks} />
        ) : (
          <div className={styles.groupChildren}>
            {blocks.map((block, index) => (
              <ToolCallBlock
                key={block.toolCallId || index}
                block={block}
              />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
