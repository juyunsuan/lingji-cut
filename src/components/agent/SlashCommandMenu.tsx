import { useEffect, useRef } from 'react';
import type { AvailableCommand } from '../../../electron/acp/types';

interface SlashCommandMenuProps {
  commands: AvailableCommand[];
  filter: string;
  selectedIndex: number;
  onSelect: (command: AvailableCommand) => void;
}

export function SlashCommandMenu({
  commands,
  filter,
  selectedIndex,
  onSelect,
}: SlashCommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = commands.filter((cmd) =>
    cmd.name.toLowerCase().includes(filter.toLowerCase()),
  );

  // 自动滚动到选中项
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const selected = el.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        maxHeight: 240,
        overflowY: 'auto',
        background: '#2C2C2E',
        border: '1px solid #48484A',
        borderRadius: 10,
        marginBottom: 4,
        zIndex: 10,
        boxShadow: '0 -4px 16px rgba(0,0,0,0.3)',
      }}
    >
      {filtered.map((cmd, i) => (
        <div
          key={cmd.name}
          onClick={() => onSelect(cmd)}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            background: i === selectedIndex ? '#48484A' : 'transparent',
            borderBottom: i < filtered.length - 1 ? '1px solid #38383A' : undefined,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 500, color: '#EBEBF5' }}>
            /{cmd.name}
            {cmd.input?.hint && (
              <span style={{ color: '#EBEBF550', fontWeight: 400 }}>
                {' '}{cmd.input.hint}
              </span>
            )}
          </span>
          <span
            style={{
              fontSize: 11,
              color: '#EBEBF570',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {cmd.description}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 从输入文本中提取斜杠命令前缀（返回 null 表示无匹配） */
export function extractSlashPrefix(text: string): string | null {
  const match = text.match(/^\/(\S*)$/);
  return match ? match[1] : null;
}
