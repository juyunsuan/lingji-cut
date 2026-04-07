import { useCallback } from 'react';
import { useAgentStore } from '../../store/agent';
import { useScriptStore } from '../../store/script';
import { getCurrentProjectDir } from '../../store/timeline';
import { Button } from '../../ui';

const STATUS_LABELS: Record<string, string> = {
  disconnected: '未连接',
  connecting: '连接中...',
  connected: '已连接 Claude Code',
  prompting: '思考中...',
};

function formatPercent(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

export function StatusBar() {
  const status = useAgentStore((s) => s.status);
  const contextUsage = useAgentStore((s) => s.contextUsage);
  const autoConnectError = useAgentStore((s) => s.autoConnectError);

  const contextPercent =
    contextUsage && contextUsage.size > 0
      ? Math.max(0, Math.min(100, (contextUsage.used / contextUsage.size) * 100))
      : null;

  const canReconnect = status === 'disconnected' || status === 'error';
  const hasError = !!autoConnectError && status === 'disconnected';

  const displayLabel = hasError
    ? '连接失败'
    : (STATUS_LABELS[status] || status);

  const handleReconnect = useCallback(() => {
    if (!canReconnect) return;
    if (typeof window === 'undefined' || !window.agentAPI) return;

    const projectDir = useScriptStore.getState().projectDir || getCurrentProjectDir();
    if (!projectDir) return;

    useAgentStore.getState().setAutoConnectError(null);
    window.agentAPI.connect(projectDir).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      useAgentStore.getState().setAutoConnectError(msg);
    });
  }, [canReconnect]);

  return (
    <div className="flex items-center justify-between gap-2 px-4 py-1.5 border-t border-mac-separator shrink-0 text-[11px] text-mac-text-muted/30">
      <span
        title={autoConnectError || undefined}
        className={hasError ? 'text-mac-red/60' : undefined}
      >
        {displayLabel}
      </span>

      <span className="flex items-center gap-2">
        {canReconnect && (
          <Button variant="outline" size="sm" onClick={handleReconnect} className="h-5 text-[11px] px-2">
            重新连接
          </Button>
        )}
        {contextPercent !== null && (
          <span className="tabular-nums">
            上下文 {formatPercent(contextPercent)}
          </span>
        )}
      </span>
    </div>
  );
}
