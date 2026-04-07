import { useMemo } from 'react';
import { createPatch } from 'diff';

interface DiffViewProps {
  filePath: string;
  before: string;
  after: string;
}

interface DiffLine {
  type: 'add' | 'del' | 'normal' | 'header';
  content: string;
  oldNum?: number;
  newNum?: number;
}

function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldNum = 0;
  let newNum = 0;

  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)/);
      if (match) oldNum = parseInt(match[1], 10);
      const match2 = line.match(/\+(\d+)/);
      if (match2) newNum = parseInt(match2[1], 10);
      lines.push({ type: 'header', content: line });
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      lines.push({ type: 'add', content: line.slice(1), newNum: newNum++ });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      lines.push({ type: 'del', content: line.slice(1), oldNum: oldNum++ });
    } else if (line.startsWith(' ')) {
      lines.push({ type: 'normal', content: line.slice(1), oldNum: oldNum++, newNum: newNum++ });
    }
  }

  return lines;
}

const lineColors: Record<string, { bg: string; color: string }> = {
  add: { bg: '#32D74B15', color: '#32D74B' },
  del: { bg: '#FF453A15', color: '#FF453A' },
  normal: { bg: 'transparent', color: '#EBEBF580' },
  header: { bg: '#0A84FF10', color: '#0A84FF' },
};

export function DiffView({ filePath, before, after }: DiffViewProps) {
  const diffLines = useMemo(() => {
    const patch = createPatch(filePath, before, after, '', '', { context: 3 });
    return parsePatch(patch);
  }, [filePath, before, after]);

  return (
    <div
      style={{
        background: '#1A1A1C',
        borderRadius: 6,
        overflow: 'hidden',
        fontSize: 12,
        fontFamily: 'SF Mono, Menlo, monospace',
        lineHeight: 1.6,
      }}
    >
      <div
        style={{
          padding: '6px 12px',
          background: '#2C2C2E',
          color: '#EBEBF580',
          fontSize: 11,
          borderBottom: '1px solid #38383A',
        }}
      >
        {filePath}
      </div>
      <div style={{ overflowX: 'auto' }}>
        {diffLines.map((line, i) => {
          const style = lineColors[line.type];
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                background: style.bg,
                minHeight: 20,
              }}
            >
              <span
                style={{
                  width: 40,
                  textAlign: 'right',
                  padding: '0 6px',
                  color: '#EBEBF530',
                  userSelect: 'none',
                  flexShrink: 0,
                }}
              >
                {line.oldNum ?? ''}
              </span>
              <span
                style={{
                  width: 40,
                  textAlign: 'right',
                  padding: '0 6px',
                  color: '#EBEBF530',
                  userSelect: 'none',
                  flexShrink: 0,
                }}
              >
                {line.newNum ?? ''}
              </span>
              <span
                style={{
                  padding: '0 8px',
                  color: style.color,
                  whiteSpace: 'pre',
                }}
              >
                {line.type === 'add' ? '+' : line.type === 'del' ? '-' : line.type === 'header' ? '' : ' '}
                {line.content}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
