import { useState } from 'react';
import { ChevronRight, ChevronDown, FileText, Terminal } from 'lucide-react';
import type { ToolCallBlock as ToolCallBlockType } from '../../store/agent';
import { Badge } from '../../ui';
import { Spinner } from '../../ui/primitives/Spinner';

const TOOL_ICONS: Record<string, typeof FileText> = {
  read_text_file: FileText,
  write_text_file: FileText,
  create_terminal: Terminal,
  terminal_execute: Terminal,
  kill_terminal: Terminal,
};

export function ToolCallBlock({ block }: { block: ToolCallBlockType }) {
  const [inputExpanded, setInputExpanded] = useState(false);
  const [outputExpanded, setOutputExpanded] = useState(true);

  const Icon = TOOL_ICONS[block.title] || FileText;
  const isRunning = block.status === 'running';

  return (
    <div className="bg-mac-elevated rounded-lg overflow-hidden border border-mac-separator">
      {/* 标题栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-mac-separator">
        <Icon size={14} className="text-mac-text-muted/40" />
        <span className="text-xs font-semibold text-foreground flex-1">
          {block.title}
        </span>
        {isRunning ? (
          <Spinner size={14} color="var(--color-mac-blue)" />
        ) : (
          <Badge variant="success" size="xs">done</Badge>
        )}
      </div>

      {/* Input 折叠区 */}
      {block.rawInput && (
        <div>
          <button
            type="button"
            onClick={() => setInputExpanded((e) => !e)}
            className="flex items-center gap-1 w-full text-left px-3 py-1.5 bg-transparent border-none text-mac-text-muted/40 text-[11px] cursor-pointer hover:bg-white/[0.03]"
            style={{ borderBottom: inputExpanded ? '1px solid var(--color-mac-separator)' : 'none' }}
          >
            {inputExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            Input
          </button>
          {inputExpanded && (
            <pre className="px-3 py-2 m-0 text-[11px] text-mac-text-muted/50 whitespace-pre-wrap break-all max-h-[200px] overflow-auto">
              {block.rawInput}
            </pre>
          )}
        </div>
      )}

      {/* Output 折叠区 */}
      {block.rawOutput && (
        <div>
          <button
            type="button"
            onClick={() => setOutputExpanded((e) => !e)}
            className="flex items-center gap-1 w-full text-left px-3 py-1.5 bg-transparent border-none text-mac-text-muted/40 text-[11px] cursor-pointer hover:bg-white/[0.03]"
            style={{ borderBottom: outputExpanded ? '1px solid var(--color-mac-separator)' : 'none' }}
          >
            {outputExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            Output
          </button>
          {outputExpanded && (
            <pre className="px-3 py-2 m-0 text-[11px] text-mac-text-muted/50 whitespace-pre-wrap break-all max-h-[300px] overflow-auto bg-[#1A1A1C]">
              {block.rawOutput}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
