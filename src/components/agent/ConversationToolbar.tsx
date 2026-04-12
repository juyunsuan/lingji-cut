import { ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { Button } from '../../ui';

interface ConversationToolbarProps {
  collapsed?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onToggleCollapse?: () => void;
  onCreateConversation: () => void;
  onRefresh: () => void;
}

export function ConversationToolbar({
  collapsed = false,
  disabled = false,
  loading = false,
  onToggleCollapse,
  onCreateConversation,
  onRefresh,
}: ConversationToolbarProps) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-2 border-b border-mac-separator shrink-0">
        <Button
          variant="primary"
          size="sm"
          iconOnly
          onClick={onCreateConversation}
          disabled={disabled}
          aria-label="新建会话"
          title="新建会话"
        >
          <Plus size={14} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          onClick={onRefresh}
          disabled={loading}
          aria-label="刷新会话列表"
          title="刷新会话列表"
        >
          <RefreshCw size={14} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          onClick={onToggleCollapse}
          aria-label="展开会话列表"
          title="展开会话列表"
        >
          <ChevronRight size={14} />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-mac-separator shrink-0">
      <Button
        variant="primary"
        size="sm"
        onClick={onCreateConversation}
        disabled={disabled}
        className="flex-1"
      >
        <Plus size={14} />
        新建会话
      </Button>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        onClick={onRefresh}
        disabled={loading}
        aria-label="刷新会话列表"
        title="刷新会话列表"
      >
        <RefreshCw size={14} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        onClick={onToggleCollapse}
        aria-label="折叠会话列表"
        title="折叠会话列表"
      >
        <ChevronRight className="rotate-180" size={14} />
      </Button>
    </div>
  );
}
