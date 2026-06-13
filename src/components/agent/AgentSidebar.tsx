import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { m } from 'framer-motion';
import { springs, durations, easings } from '../../ui/lib/motion';
import { useScriptStore } from '../../store/script';
import { getCurrentProjectDir } from '../../store/timeline';
import { useConversationList } from '../../hooks/use-conversation-list';
import { getPreferredAgentType } from '../../lib/agent-api';
import { AgentHeader } from './AgentHeader';
import { ConversationToolbar } from './ConversationToolbar';
import { SessionListPane } from './SessionListPane';
import { ConversationDetailPane } from './ConversationDetailPane';
import styles from './AgentSidebar.module.css';
import { ConversationWorkspaceProvider } from '../../contexts/conversation-workspace-context';
import { AcpConnectionsProvider, useAcpConnections } from '../../contexts/acp-connections-context';
import { ConversationRuntimeProvider } from '../../contexts/conversation-runtime-context';
import { QUICK_ACTION_CONVERSATION_EVENT } from '../../lib/quick-action-conversation';
import {
  loadAgentSessionListCollapsed,
  saveAgentSessionListCollapsed,
} from '../../lib/agent-sidebar-storage';

const MIN_WIDTH = 320;
const MAX_WIDTH = 700;

function AgentSidebarWorkspace({ projectDir }: { projectDir: string | null }) {
  const conversationProjectId = useMemo(() => projectDir, [projectDir]);

  if (!conversationProjectId) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 text-center text-sm text-mac-text-muted/60">
        先打开一个项目目录，才能使用会话工作区。
      </div>
    );
  }

  return (
    <ConversationWorkspaceProvider projectId={conversationProjectId}>
      <AcpConnectionsProvider>
        <ConversationRuntimeProvider>
          <SidebarWorkspaceShell projectDir={conversationProjectId} />
        </ConversationRuntimeProvider>
      </AcpConnectionsProvider>
    </ConversationWorkspaceProvider>
  );
}

function SidebarWorkspaceShell({ projectDir }: { projectDir: string }) {
  const [explicitConversationId, setExplicitConversationId] = useState<number | null>(null);
  const [sessionListCollapsed, setSessionListCollapsed] = useState(() =>
    loadAgentSessionListCollapsed(),
  );
  const connections = useAcpConnections();
  const {
    loading,
    activeConversationId,
    refresh,
    createConversation,
    deleteConversation,
    setActiveConversation,
  } = useConversationList();

  // 侧边栏打开后，workspace bootstrap 会加载上次活跃/首条会话；
  // 自动同步到 explicitConversationId 以触发连接。
  useEffect(() => {
    if (explicitConversationId === null && activeConversationId !== null) {
      setExplicitConversationId(activeConversationId);
    }
  }, [explicitConversationId, activeConversationId]);

  async function handleCreateConversation() {
    const agentType = await getPreferredAgentType();
    const created = await createConversation({
      agentType,
    });
    setExplicitConversationId(created.id);
  }

  async function handleSelectConversation(conversationId: number) {
    setExplicitConversationId(conversationId);
    await setActiveConversation(conversationId);
  }

  async function handleDeleteConversation(conversationId: number) {
    try {
      await connections.disconnect(conversationId);
    } catch {
      // 会话可能本来就没建立 runtime，删除时忽略即可。
    }

    if (explicitConversationId === conversationId) {
      setExplicitConversationId(null);
    }
    await deleteConversation(conversationId);
  }

  useEffect(() => {
    saveAgentSessionListCollapsed(sessionListCollapsed);
  }, [sessionListCollapsed]);

  useEffect(() => {
    const onActivate = (event: Event) => {
      const detail = (event as CustomEvent<{
        projectId: string;
        conversationId: number;
        explicit: boolean;
      }>).detail;
      if (!detail || detail.projectId !== projectDir) {
        return;
      }

      if (detail.explicit) {
        setExplicitConversationId(detail.conversationId);
      }
      void setActiveConversation(detail.conversationId);
    };

    window.addEventListener(QUICK_ACTION_CONVERSATION_EVENT, onActivate);
    return () => {
      window.removeEventListener(QUICK_ACTION_CONVERSATION_EVENT, onActivate);
    };
  }, [projectDir, setActiveConversation]);

  return (
    <div className="flex-1 min-w-0 min-h-0 flex">
      <div
        className={`border-r border-mac-separator bg-white/[0.02] flex flex-col min-h-0 transition-[width] duration-200 ease-out ${
          sessionListCollapsed ? 'w-[64px] min-w-[64px] max-w-[64px]' : 'w-[240px] min-w-[220px] max-w-[280px]'
        }`}
      >
        <ConversationToolbar
          collapsed={sessionListCollapsed}
          loading={loading}
          onToggleCollapse={() => setSessionListCollapsed((current) => !current)}
          onCreateConversation={() => void handleCreateConversation()}
          onRefresh={() => void refresh()}
        />
        <SessionListPane
          collapsed={sessionListCollapsed}
          explicitConversationId={explicitConversationId}
          onSelectConversation={(conversationId) => {
            void handleSelectConversation(conversationId);
          }}
          onDeleteConversation={(conversationId) => {
            void handleDeleteConversation(conversationId);
          }}
          onCreateConversation={() => {
            void handleCreateConversation();
          }}
        />
      </div>
      <ConversationDetailPane
        projectDir={projectDir}
        explicitActivated={explicitConversationId !== null}
      />
    </div>
  );
}

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

  const projectDir = scriptProjectDir || getCurrentProjectDir();

  return (
    <m.aside
      className={styles.sidebar}
      style={{ width }}
      initial={{ x: width, opacity: 0 }}
      animate={{ x: 0, opacity: 1, transition: springs.smooth }}
      exit={{
        x: width,
        opacity: 0,
        transition: { duration: durations.base, ease: easings.easeOutExpo },
      }}
    >
      <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />
      <div className={styles.content}>
        <AgentHeader />
        <AgentSidebarWorkspace projectDir={projectDir} />
      </div>
    </m.aside>
  );
}
