import { useEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, Brain } from 'lucide-react';

export function ThinkingBlock({
  text,
  label = '思考过程',
  streaming = false,
}: {
  text: string;
  label?: string;
  streaming?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [autoExpandedFor, setAutoExpandedFor] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 流式开始时自动展开一次，之后尊重用户手动折叠
  useEffect(() => {
    if (streaming && !autoExpandedFor) {
      setExpanded(true);
      setAutoExpandedFor(true);
    }
    if (!streaming) {
      setAutoExpandedFor(false);
    }
  }, [streaming, autoExpandedFor]);

  // 流式期间自动滚动到底部，跟随最新推理内容
  useEffect(() => {
    if (!streaming || !expanded) return;
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [text, streaming, expanded]);

  const charCount = text.length;

  return (
    <div
      className={`relative rounded-lg overflow-hidden border transition-colors ${
        streaming
          ? 'bg-[#1e2433] border-[#0A84FF]/40 shadow-[0_0_0_1px_rgba(10,132,255,0.15),0_8px_24px_-12px_rgba(10,132,255,0.35)]'
          : 'bg-mac-elevated border-white/[0.06]'
      }`}
    >
      {/* 左侧 accent 条：流式期间点亮系统蓝 */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-[2px] transition-colors ${
          streaming ? 'bg-[#0A84FF]' : 'bg-white/10'
        }`}
      />

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-2 w-full text-left pl-3.5 pr-3 py-2 bg-transparent border-none cursor-pointer hover:bg-white/[0.03] transition-colors"
      >
        {expanded ? (
          <ChevronDown size={12} className="text-mac-text-sec flex-shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-mac-text-sec flex-shrink-0" />
        )}
        <Brain
          size={12}
          className={`flex-shrink-0 ${streaming ? 'text-[#0A84FF]' : 'text-mac-text-sec'}`}
        />
        <span
          className={`text-[11px] font-medium tracking-wide ${
            streaming ? 'text-white' : 'text-mac-text-sec'
          }`}
        >
          {label}
        </span>

        {streaming && (
          <span className="flex items-center gap-1 ml-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#0A84FF] opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#0A84FF]" />
            </span>
            <span className="text-[10px] text-[#0A84FF] font-medium">推理中</span>
          </span>
        )}

        {charCount > 0 && (
          <span className="ml-auto text-[10px] text-mac-text-sec/70 tabular-nums">
            {charCount.toLocaleString()} 字
          </span>
        )}
      </button>

      {expanded && (
        <div
          ref={bodyRef}
          className="relative pl-3.5 pr-3 pb-2.5 pt-0.5 text-[12px] leading-[1.7] text-mac-text-sec whitespace-pre-wrap break-words max-h-[220px] overflow-y-auto"
          style={{
            fontFamily:
              "'SF Mono', 'JetBrains Mono', Menlo, Consolas, 'PingFang SC', monospace",
          }}
        >
          {text || (
            <span className="text-mac-text-muted italic">等待模型输出推理...</span>
          )}
          {streaming && text && (
            <span className="inline-block w-[6px] h-[13px] align-[-2px] ml-0.5 bg-[#0A84FF] animate-pulse" />
          )}
        </div>
      )}
    </div>
  );
}
