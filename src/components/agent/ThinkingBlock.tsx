import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

export function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-mac-elevated rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1.5 w-full text-left px-3 py-2 bg-transparent border-none text-mac-text-muted/40 text-xs italic cursor-pointer hover:bg-white/[0.03]"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Thinking...
      </button>
      {expanded && (
        <div className="px-3 pb-2.5 text-xs leading-relaxed text-mac-text-muted/25 italic whitespace-pre-wrap break-words">
          {text}
        </div>
      )}
    </div>
  );
}
