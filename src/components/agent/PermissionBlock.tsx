import { Shield } from 'lucide-react';
import type { PermissionBlock as PermissionBlockType } from '../../store/agent';
import { useAgentStore } from '../../store/agent';
import { Button } from '../../ui';

export function PermissionBlock({ block }: { block: PermissionBlockType }) {
  const responded = Boolean(block.response);

  const handleRespond = (optionId: string) => {
    window.agentAPI?.respondPermission(block.requestId, optionId);
    useAgentStore.getState().resolvePermission(block.requestId, optionId);
  };

  return (
    <div className="rounded-lg p-3 bg-mac-yellow/[0.08] border border-mac-yellow/25">
      <div className="flex items-center gap-2 mb-2">
        <Shield size={14} className="text-mac-yellow" />
        <span className="text-xs font-semibold text-mac-yellow">权限请求</span>
      </div>

      <div className="text-xs text-mac-text-muted/50 mb-2.5">
        {JSON.stringify(block.toolCall, null, 2)}
      </div>

      {!responded && (
        <div className="flex gap-2">
          {block.options.map((opt) => (
            <Button
              key={opt.optionId}
              variant={opt.kind.startsWith('allow') ? 'success' : 'destructive'}
              size="sm"
              onClick={() => handleRespond(opt.optionId)}
            >
              {opt.name}
            </Button>
          ))}
        </div>
      )}

      {responded && (
        <span className="text-xs text-mac-text-muted/30 italic">已响应</span>
      )}
    </div>
  );
}
