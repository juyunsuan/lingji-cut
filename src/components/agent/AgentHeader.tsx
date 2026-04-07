import { Trash2, X } from 'lucide-react';
import { useAgentStore } from '../../store/agent';
import { Button } from '../../ui';

export function AgentHeader() {
  const status = useAgentStore((s) => s.status);
  const toggleSidebar = useAgentStore((s) => s.toggleSidebar);
  const clearMessages = useAgentStore((s) => s.clearMessages);

  const statusColor =
    status === 'connected' || status === 'prompting'
      ? '#32D74B'
      : status === 'connecting'
        ? '#FFD60A'
        : status === 'error'
          ? '#FF453A'
          : '#636366';

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-mac-separator shrink-0">
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: statusColor }}
      />
      <span className="text-[13px] font-semibold flex-1">Claude Code</span>

      <Button variant="ghost" size="sm" iconOnly onClick={clearMessages} title="清空对话">
        <Trash2 size={14} />
      </Button>

      <Button variant="ghost" size="sm" iconOnly onClick={toggleSidebar} title="关闭面板">
        <X size={14} />
      </Button>
    </div>
  );
}
