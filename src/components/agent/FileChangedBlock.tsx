import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, FilePenLine } from 'lucide-react';
import styles from './AgentTranscript.module.css';

export interface FileChangedBlockData {
  type: 'file_changed';
  path: string;
  before: string | null;
  after: string;
  diff?: string;
  operation?: 'edit' | 'create' | 'delete';
}

interface DiffLine {
  kind: 'same' | 'add' | 'remove';
  oldLine: number | null;
  newLine: number | null;
  text: string;
}

function fileName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function changedLineCount(file: FileChangedBlockData): { added: number; removed: number } {
  const fromDiff = file.diff ? diffLineCount(file.diff) : null;
  if (fromDiff) return fromDiff;

  const before = file.before?.split('\n') ?? [];
  const after = file.after.split('\n');
  if (file.before === null) {
    return { added: after.filter((line) => line.length > 0).length || after.length, removed: 0 };
  }

  const max = Math.max(before.length, after.length);
  let added = 0;
  let removed = 0;
  for (let i = 0; i < max; i += 1) {
    if (before[i] === after[i]) continue;
    if (before[i] !== undefined) removed += 1;
    if (after[i] !== undefined) added += 1;
  }
  return { added, removed };
}

function diffLineCount(diff: string): { added: number; removed: number } | null {
  let added = 0;
  let removed = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) added += 1;
    if (line.startsWith('-')) removed += 1;
  }
  return added || removed ? { added, removed } : null;
}

function simpleDiff(file: FileChangedBlockData): DiffLine[] {
  if (file.diff) {
    const parsed = parseUnifiedDiff(file.diff);
    if (parsed.length > 0) return parsed.slice(0, 120);
  }

  const before = file.before?.split('\n') ?? [];
  const after = file.after.split('\n');
  const max = Math.max(before.length, after.length);
  const lines: DiffLine[] = [];

  for (let i = 0; i < max; i += 1) {
    const oldText = before[i];
    const newText = after[i];
    if (oldText === newText) {
      if (oldText !== undefined) {
        lines.push({ kind: 'same', oldLine: i + 1, newLine: i + 1, text: oldText });
      }
      continue;
    }
    if (oldText !== undefined) {
      lines.push({ kind: 'remove', oldLine: i + 1, newLine: null, text: oldText });
    }
    if (newText !== undefined) {
      lines.push({ kind: 'add', oldLine: null, newLine: i + 1, text: newText });
    }
  }

  return lines.slice(0, 80);
}

function parseUnifiedDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const rawLine of diff.split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(rawLine);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      continue;
    }
    if (rawLine.startsWith('+++') || rawLine.startsWith('---') || rawLine.startsWith('diff ')) {
      continue;
    }
    if (!rawLine) continue;

    const marker = rawLine[0];
    const text = rawLine.slice(1);
    if (marker === '+') {
      lines.push({ kind: 'add', oldLine: null, newLine: newLine || null, text });
      if (newLine) newLine += 1;
      continue;
    }
    if (marker === '-') {
      lines.push({ kind: 'remove', oldLine: oldLine || null, newLine: null, text });
      if (oldLine) oldLine += 1;
      continue;
    }
    if (marker === ' ') {
      lines.push({ kind: 'same', oldLine: oldLine || null, newLine: newLine || null, text });
      if (oldLine) oldLine += 1;
      if (newLine) newLine += 1;
    }
  }

  return lines;
}

function DiffPreview({ file }: { file: FileChangedBlockData }) {
  const diff = useMemo(() => simpleDiff(file), [file]);
  const count = changedLineCount(file);

  return (
    <div className={styles.diffCard}>
      <div className={styles.diffHeader}>
        <span className={styles.diffFileName} title={file.path}>
          {fileName(file.path)}
        </span>
        <span className={styles.plus}>+{count.added}</span>
        <span className={styles.minus}>-{count.removed}</span>
        <Copy size={14} strokeWidth={1.8} aria-hidden />
      </div>
      {diff.length === 0 ? (
        <div className={styles.emptyDiff}>文件内容无可展示差异</div>
      ) : (
        <table className={styles.diffTable}>
          <tbody>
            {diff.map((line, index) => {
              const isAdd = line.kind === 'add';
              const isRemove = line.kind === 'remove';
              return (
                <tr
                  key={`${line.kind}-${line.oldLine ?? line.newLine ?? index}-${index}`}
                  className={isAdd ? styles.diffRowAdd : isRemove ? styles.diffRowRemove : ''}
                >
                  <td
                    className={`${styles.lineNo} ${
                      isAdd ? styles.lineNoAdd : isRemove ? styles.lineNoRemove : ''
                    }`}
                  >
                    {line.oldLine ?? line.newLine ?? ''}
                  </td>
                  <td className={styles.lineCode}>{line.text || ' '}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function fileListLabel(actionLabel: string): string {
  if (actionLabel === '新增了') return '已新增的文件';
  if (actionLabel === '删除了') return '已删除的文件';
  if (actionLabel === '编辑了') return '已编辑的文件';
  return '已变更的文件';
}

export function FileChangedBlock({ files }: { files: FileChangedBlockData[] }) {
  const [expanded, setExpanded] = useState(true);
  if (files.length === 0) return null;
  const operations = new Set(files.map((file) => file.operation ?? 'edit'));
  const actionLabel =
    operations.size === 1 && operations.has('create')
      ? '新增了'
      : operations.size === 1 && operations.has('delete')
        ? '删除了'
        : operations.size === 1 && operations.has('edit')
          ? '编辑了'
          : '变更了';

  const total = files.reduce(
    (acc, file) => {
      const count = changedLineCount(file);
      return { added: acc.added + count.added, removed: acc.removed + count.removed };
    },
    { added: 0, removed: 0 },
  );

  return (
    <div className={styles.event}>
      <button
        type="button"
        className={`${styles.eventHeader} ${styles.eventHeaderInteractive}`}
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className={styles.eventIcon}>
          <FilePenLine size={15} strokeWidth={1.8} />
        </span>
        <span className={styles.eventLabel}>{actionLabel} {files.length} 个文件</span>
        <span className={styles.plus}>+{total.added}</span>
        <span className={styles.minus}>-{total.removed}</span>
        <span className={styles.eventChevron} aria-hidden>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {expanded ? (
        <div className={styles.fileGroupBody}>
          <div className={styles.fileGroupTitle}>
            <span>{fileListLabel(actionLabel)}</span>
            <ChevronDown size={14} strokeWidth={1.8} aria-hidden />
          </div>
          <div className={styles.fileDiffList}>
            {files.map((file) => (
              <DiffPreview key={file.path} file={file} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
