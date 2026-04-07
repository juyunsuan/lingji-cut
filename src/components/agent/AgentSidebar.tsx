import { useEffect, useCallback, useState, useRef } from 'react';
import { useAgentStore } from '../../store/agent';
import { useScriptStore } from '../../store/script';
import { getCurrentProjectDir } from '../../store/timeline';
import { AgentHeader } from './AgentHeader';
import { MessageList } from './MessageList';
import { InputBar } from './InputBar';
import { StatusBar } from './StatusBar';
import styles from './AgentSidebar.module.css';
import type { AcpConfigOption, AvailableCommand } from '../../../electron/acp/types';

const MIN_WIDTH = 320;
const MAX_WIDTH = 700;

export function AgentSidebar() {
  const scriptProjectDir = useScriptStore((s) => s.projectDir);
  const [width, setWidth] = useState(420);
  const resizingRef = useRef(false);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizingRef.current = true;
      const startX = e.clientX;
      const startWidth = width;

      const onMove = (moveEvent: MouseEvent) => {
        if (!resizingRef.current) return;
        const delta = startX - moveEvent.clientX;
        setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta)));
      };
      const onUp = () => {
        resizingRef.current = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [width],
  );

  // IPC 事件监听（全局，不随 sidebar 开关重建）
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.agentAPI === 'undefined') return;

    const unsubStatus = window.agentAPI.onStatusChanged((s) => {
      useAgentStore.getState().setStatus(s as ReturnType<typeof useAgentStore.getState>['status']);
    });

    const unsubEvent = window.agentAPI.onEvent((block) => {
      const store = useAgentStore.getState();
      const event = block as { type: string; [key: string]: unknown };

      switch (event.type) {
        case 'content_delta':
          store.appendTextDelta(event.text as string);
          break;
        case 'thinking':
          store.appendThinking(event.text as string);
          break;
        case 'tool_call':
          store.addToolCall(event as Parameters<typeof store.addToolCall>[0]);
          break;
        case 'tool_call_update':
          store.updateToolCall(event as Parameters<typeof store.updateToolCall>[0]);
          break;
        case 'turn_complete': {
          store.markTurnComplete(event.stopReason as string);
          const usage = event.usage as { used: number; size: number } | undefined;
          if (usage && usage.used > 0) {
            store.setContextUsage(usage);
          }
          break;
        }
        case 'usage': {
          const used = event.used as number;
          const size = event.size as number;
          if (used > 0 && size > 0) {
            store.setContextUsage({ used, size });
          }
          break;
        }
        case 'permission_request':
          store.addPermissionRequest(event as Parameters<typeof store.addPermissionRequest>[0]);
          break;
        case 'file_changed':
          store.addFileChanged(event as Parameters<typeof store.addFileChanged>[0]);
          break;
        case 'error':
          store.addError(event.message as string);
          break;
        case 'available_commands':
          store.setAvailableCommands((event.commands as AvailableCommand[]) ?? []);
          break;
        case 'config_update':
          if (event.configOptions) {
            store.setConfigOptions(event.configOptions as AcpConfigOption[]);
          }
          break;
      }
    });

    const unsubCaps = window.agentAPI.onCapabilities((caps) => {
      const c = caps as {
        modes?: unknown[];
        configOptions?: unknown[];
        currentModeId?: string;
      };
      const store = useAgentStore.getState();
      if (c.modes) store.setModes(c.modes as Parameters<typeof store.setModes>[0]);
      if (c.configOptions) store.setConfigOptions(c.configOptions as AcpConfigOption[]);
      if (c.currentModeId) store.setCurrentMode(c.currentModeId);
    });

    return () => {
      unsubStatus();
      unsubEvent();
      unsubCaps();
    };
  }, []);

  const sidebarOpen = useAgentStore((s) => s.sidebarOpen);

  // 组件挂载 / sidebar 打开 / projectDir 变化时自动连接
  // 不检查 store 中的 status — 它可能因组件卸载期间丢失 IPC 事件而过期
  // main process 的 connect handler 内置去重逻辑，已连接时为 no-op 并同步状态
  useEffect(() => {
    if (!sidebarOpen) return;
    if (typeof window === 'undefined' || !window.agentAPI) return;

    const projectDir = scriptProjectDir || getCurrentProjectDir();
    if (!projectDir) return;

    let cancelled = false;
    window.agentAPI
      .connect(projectDir)
      .then(() => {
        if (!cancelled) useAgentStore.getState().setAutoConnectError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error('[Agent] 自动连接失败:', msg);
          useAgentStore.getState().setAutoConnectError(msg);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sidebarOpen, scriptProjectDir]);

  return (
    <aside className={styles.sidebar} style={{ width }}>
      <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />
      <div className={styles.content}>
        <AgentHeader />
        <MessageList />
        <InputBar />
        <StatusBar />
      </div>
    </aside>
  );
}
