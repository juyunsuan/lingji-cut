import { useCallback, useEffect, useRef, useState } from 'react';
import { useAgentStore } from '../store/agent';
import styles from './AppStatusBar.module.css';

// ─── 圆形进度图标常量 ──────────────────────────────────────
const ICON_RADIUS = 6;
const ICON_CENTER = 8;
const ICON_VIEWBOX = 16;
const ICON_CIRCUMFERENCE = 2 * Math.PI * ICON_RADIUS;

function formatPercent(percent: number | null): string {
  if (percent == null) return '--';
  return `${percent.toFixed(1)}%`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

// ─── 连接状态标签 ───────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  disconnected: '未连接',
  connecting: '连接中…',
  connected: '已连接',
  prompting: '思考中…',
  error: '连接错误',
};

// ─── 上下文窗口弹出面板 ──────────────────────────────────────
function ContextPopover({
  used,
  size,
  percent,
}: {
  used: number;
  size: number;
  percent: number;
}) {
  return (
    <div className={styles.popover}>
      <div className={styles.popoverTitle}>上下文窗口</div>
      <div className={styles.popoverRow}>
        <span>使用率</span>
        <span>{formatPercent(percent)}</span>
      </div>
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${percent}%` }} />
      </div>
      <div className={styles.popoverRow}>
        <span>已用 / 总量</span>
        <span>
          {formatNumber(used)} / {formatNumber(size)}
        </span>
      </div>
    </div>
  );
}

// ─── 上下文窗口指示器 ───────────────────────────────────────
function ContextWindowIndicator() {
  const contextUsage = useAgentStore((s) => s.contextUsage);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleEnter = useCallback(() => {
    clearTimeout(timerRef.current);
    setPopoverOpen(true);
  }, []);

  const handleLeave = useCallback(() => {
    timerRef.current = setTimeout(() => setPopoverOpen(false), 200);
  }, []);

  // 组件卸载时清理 timer
  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  if (!contextUsage) return null;

  const { used, size } = contextUsage;
  if (size <= 0) return null;

  const percent = Math.max(0, Math.min(100, (used / size) * 100));
  const dashOffset = ICON_CIRCUMFERENCE * (1 - percent / 100);

  return (
    <div
      className={styles.contextUsage}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <svg
        aria-label="上下文窗口用量"
        width={14}
        height={14}
        viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      >
        <circle
          cx={ICON_CENTER}
          cy={ICON_CENTER}
          r={ICON_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.25"
        />
        <circle
          cx={ICON_CENTER}
          cy={ICON_CENTER}
          r={ICON_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={`${ICON_CIRCUMFERENCE} ${ICON_CIRCUMFERENCE}`}
          strokeDashoffset={dashOffset}
          style={{ transformOrigin: 'center', transform: 'rotate(-90deg)' }}
          opacity="0.75"
        />
      </svg>
      <span>{formatPercent(percent)}</span>

      {popoverOpen && <ContextPopover used={used} size={size} percent={percent} />}
    </div>
  );
}

// ─── 连接状态指示器 ─────────────────────────────────────────
function ConnectionIndicator() {
  const status = useAgentStore((s) => s.status);
  const autoConnectError = useAgentStore((s) => s.autoConnectError);

  const displayStatus = autoConnectError && status === 'disconnected' ? 'error' : status;
  const label = STATUS_LABELS[displayStatus] || displayStatus;

  return (
    <div className={styles.connectionStatus} title={autoConnectError || label}>
      <div className={styles.statusDot} data-status={displayStatus} />
      <span>{label}</span>
    </div>
  );
}

// ─── 主组件 ────────────────────────────────────────────────
export function AppStatusBar() {
  return (
    <div className={styles.statusBar}>
      <div className={styles.left} />
      <div className={styles.right}>
        <ContextWindowIndicator />
        <ConnectionIndicator />
      </div>
    </div>
  );
}
