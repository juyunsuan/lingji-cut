import type { RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkflowState } from '../store/ai';
import { useAIStore } from '../store/ai';
import { useTimelineStore } from '../store/timeline';
import { getTimelineTrackWidth } from '../lib/timeline-view';

interface TimelineAIOverlayProps {
  workflow: WorkflowState;
  timelineContainerRef: RefObject<HTMLDivElement | null>;
  compactTimeline: boolean;
  onCancel: () => void;
  onRetry: () => void;
}

function FloatingAICursor({
  x,
  y,
  label,
}: {
  x: number;
  y: number;
  label: string;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        transform: 'translate(-50%, -100%)',
        zIndex: 1004,
        pointerEvents: 'none',
        transition: 'left 0.18s ease-out, top 0.18s ease-out',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        border: '1px solid rgba(167, 139, 250, 0.45)',
        background: 'rgba(88, 28, 135, 0.34)',
        color: '#ddd6fe',
        fontSize: 11,
        boxShadow: '0 10px 30px rgba(76, 29, 149, 0.28)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <span>{label}</span>
    </div>
  );
}

export function TimelineAIOverlay({
  workflow,
  timelineContainerRef,
  compactTimeline,
  onCancel,
  onRetry,
}: TimelineAIOverlayProps) {
  const [cursorPos, setCursorPos] = useState({ x: -200, y: -200 });
  const [containerBox, setContainerBox] = useState({ width: 0, height: 0 });
  const frameRef = useRef<number | null>(null);
  const isVisible = workflow.step !== 'idle' && workflow.step !== 'done';
  const isError = workflow.step === 'error';
  const isArranging = workflow.step === 'arranging';
  const analysisResult = useAIStore((state) => state.analysisResult);
  const timeline = useTimelineStore((state) => state.timeline);

  const audioTrackHeight = compactTimeline ? 26 : 30;
  const subtitleTrackHeight = compactTimeline ? 52 : 60;
  const overlayTrackHeight = compactTimeline ? 30 : 34;
  const outerPadding = compactTimeline ? 8 : 10;
  const sidebarWidth = compactTimeline ? 86 : 104;
  const rulerHeight = 24;

  const aiOverlays = useMemo(
    () =>
      timeline.overlays.filter(
        (overlay) => overlay.overlayType === 'ai-card' && overlay.aiCardData?.sourceCardId,
      ),
    [timeline.overlays],
  );
  const visualTrackOrder = useMemo(
    () =>
      timeline.tracks
        .filter((track) => track.kind === 'visual')
        .sort((left, right) => {
          if (left.order !== right.order) {
            return left.order - right.order;
          }

          return left.id.localeCompare(right.id);
        }),
    [timeline.tracks],
  );
  const trackWidth = useMemo(() => {
    const usableWidth = Math.max(480, containerBox.width - outerPadding * 2 - sidebarWidth);
    return getTimelineTrackWidth(
      Math.max(1_000, timeline.podcast.durationMs || 1_000),
      1,
      usableWidth,
    );
  }, [containerBox.width, outerPadding, sidebarWidth, timeline.podcast.durationMs]);
  const arrangingBlocks = useMemo(
    () =>
      aiOverlays.map((overlay) => {
        const trackIndex = Math.max(
          0,
          visualTrackOrder.findIndex((track) => track.id === overlay.trackId),
        );
        const durationMs = Math.max(1_000, timeline.podcast.durationMs || 1_000);
        const left =
          outerPadding +
          sidebarWidth +
          (overlay.startMs / durationMs) * trackWidth;
        const width = Math.max(36, (overlay.durationMs / durationMs) * trackWidth);
        const top =
          outerPadding +
          rulerHeight +
          audioTrackHeight +
          subtitleTrackHeight +
          trackIndex * overlayTrackHeight +
          4;

        return {
          id: overlay.id,
          left,
          top,
          width,
          label: overlay.aiCardData?.title || 'AI 卡片',
        };
      }),
    [
      aiOverlays,
      audioTrackHeight,
      outerPadding,
      overlayTrackHeight,
      rulerHeight,
      sidebarWidth,
      subtitleTrackHeight,
      timeline.podcast.durationMs,
      trackWidth,
      visualTrackOrder,
    ],
  );
  const latestArrangingBlock = arrangingBlocks[arrangingBlocks.length - 1];

  useEffect(() => {
    if (!isVisible) {
      setCursorPos({ x: -200, y: -200 });
      return;
    }

    const tick = () => {
      const container = timelineContainerRef.current;
      if (!container) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      const rect = container.getBoundingClientRect();
      if (rect.width !== containerBox.width || rect.height !== containerBox.height) {
        setContainerBox({ width: rect.width, height: rect.height });
      }

      const fallbackX =
        outerPadding +
        sidebarWidth +
        ((workflow.progress || 0) / 100) * Math.max(trackWidth, 120);
      const targetX = isArranging && latestArrangingBlock
        ? latestArrangingBlock.left + latestArrangingBlock.width / 2
        : fallbackX;
      const targetY = isArranging && latestArrangingBlock
        ? latestArrangingBlock.top
        : outerPadding + 36;
      const x = rect.left + Math.min(Math.max(targetX, 40), rect.width - 40);
      const y = rect.top + Math.min(Math.max(targetY, 24), rect.height - 16);
      setCursorPos({ x, y });
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [isVisible, timelineContainerRef]);

  if (!isVisible) {
    return null;
  }

  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1000,
          pointerEvents: 'all',
          background: isError ? 'rgba(20, 20, 24, 0.12)' : 'rgba(12, 10, 20, 0.3)',
          transition: 'background 180ms ease',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1001,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          background: isError
            ? 'rgba(127, 29, 29, 0.22)'
            : 'linear-gradient(90deg, rgba(76, 29, 149, 0.52), rgba(59, 7, 100, 0.32))',
          borderBottom: `1px solid ${
            isError ? 'rgba(248, 113, 113, 0.28)' : 'rgba(196, 181, 253, 0.2)'
          }`,
          backdropFilter: 'blur(10px)',
        }}
      >
        {!isError ? (
          <div
            style={{
              width: 136,
              height: 5,
              flexShrink: 0,
              overflow: 'hidden',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.12)',
            }}
          >
            <div
              style={{
                width: `${workflow.progress}%`,
                height: '100%',
                borderRadius: 999,
                background: 'linear-gradient(90deg, #c084fc, #60a5fa)',
                boxShadow: '0 0 18px rgba(192, 132, 252, 0.45)',
                transition: 'width 200ms ease',
              }}
            />
          </div>
        ) : null}

        <span
          style={{
            flex: 1,
            fontSize: 12,
            fontWeight: 600,
            color: isError ? '#fecaca' : '#ede9fe',
          }}
        >
          {isError
            ? `AI 流程中断：${workflow.error ?? '发生未知错误'}`
            : `${workflow.stepLabel} ${Math.round(workflow.progress)}%`}
        </span>

        {isError ? (
          <>
            <button
              type="button"
              onClick={onRetry}
              style={actionButtonStyle('primary')}
            >
              断点重试
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={actionButtonStyle('secondary')}
            >
              关闭
            </button>
          </>
        ) : null}
        {!isError && workflow.canCancel ? (
          <button
            type="button"
            onClick={onCancel}
            style={actionButtonStyle('secondary')}
          >
            取消
          </button>
        ) : null}
      </div>

      {isArranging ? (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            zIndex: 1002,
            transform: 'translate(-50%, -50%)',
            padding: '18px 22px',
            borderRadius: 18,
            border: '1px solid rgba(196, 181, 253, 0.22)',
            background:
              'linear-gradient(135deg, rgba(46, 16, 101, 0.92), rgba(30, 41, 59, 0.84))',
            textAlign: 'center',
            boxShadow: '0 20px 50px rgba(15, 23, 42, 0.32)',
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>AI</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#ddd6fe' }}>
            正在自动排布时间轴
          </div>
        </div>
      ) : null}

      {isArranging
        ? arrangingBlocks.map((block) => (
            <div
              key={block.id}
              style={{
                position: 'absolute',
                left: block.left,
                top: block.top,
                width: block.width,
                height: Math.max(overlayTrackHeight - 8, 20),
                zIndex: 1002,
                borderRadius: 8,
                border: '1px solid rgba(192, 132, 252, 0.36)',
                background:
                  'linear-gradient(135deg, rgba(76, 29, 149, 0.82), rgba(37, 99, 235, 0.45))',
                boxShadow: '0 12px 24px rgba(17, 24, 39, 0.22)',
                color: '#ede9fe',
                fontSize: 10,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                padding: '0 8px',
                animation: 'aiOverlayBlockIn 220ms ease-out',
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {block.label}
              </span>
            </div>
          ))
        : null}

      {!isError ? (
        <FloatingAICursor
          x={cursorPos.x}
          y={cursorPos.y}
          label={isArranging ? 'AI 正在排布' : 'AI 处理中'}
        />
      ) : null}
      <style>
        {`
          @keyframes aiOverlayBlockIn {
            0% {
              opacity: 0;
              transform: translateY(-18px) scale(0.92);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}
      </style>
    </>
  );
}

function actionButtonStyle(kind: 'primary' | 'secondary') {
  return {
    flexShrink: 0,
    borderRadius: 999,
    border:
      kind === 'primary'
        ? '1px solid rgba(167, 139, 250, 0.42)'
        : '1px solid rgba(221, 214, 254, 0.24)',
    background:
      kind === 'primary'
        ? 'linear-gradient(90deg, rgba(167, 139, 250, 0.28), rgba(96, 165, 250, 0.2))'
        : 'rgba(255,255,255,0.08)',
    color: '#ede9fe',
    fontSize: 11,
    padding: '4px 10px',
    cursor: 'pointer',
  } as const;
}
