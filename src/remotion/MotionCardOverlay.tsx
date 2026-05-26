import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import {
  createMotionComponent as buildMotionComponent,
  formatMotionRuntimeError,
} from '../lib/motion-runtime';
import type {
  MotionCardPayload,
  MotionComponentProps,
  MotionSubtitleCue,
} from '../types/motion';

interface MotionCardOverlayProps {
  motionCard: MotionCardPayload;
  /** Sequence 本地时长（帧），由父级 AICardOverlay 计算后传入。 */
  durationInFrames?: number;
  /** 渲染容器宽度，PiP 模式与 fullscreen 不同，须由父级显式传入。 */
  width?: number;
  /** 渲染容器高度。 */
  height?: number;
  /** 当前卡片时间窗内的字幕行（含相对帧），驱动跟随讲述的顺序动画。 */
  subtitles?: MotionSubtitleCue[];
}

const EMPTY_SUBTITLES: MotionSubtitleCue[] = [];

interface CreateMotionResult {
  component?: React.ComponentType<MotionComponentProps>;
  error?: string;
}

function createMotion(compiledCode: string): CreateMotionResult {
  try {
    return { component: buildMotionComponent(compiledCode) };
  } catch (error) {
    return { error: formatMotionRuntimeError(error) };
  }
}

function MotionErrorFallback({
  error,
  width,
  height,
}: {
  error: string;
  width: number;
  height: number;
}) {
  return (
    <div
      style={{
        width,
        height,
        background: '#111',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: 18,
        textAlign: 'center',
        padding: 16,
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 600 }}>动画渲染失败</div>
      <div style={{ marginTop: 8, opacity: 0.8 }}>{error}</div>
    </div>
  );
}

type MotionErrorBoundaryProps = {
  children: React.ReactNode;
  width: number;
  height: number;
  onError?: (message: string) => void;
};

type MotionErrorBoundaryState = { error: string | null };

class MotionErrorBoundary extends React.Component<
  MotionErrorBoundaryProps,
  MotionErrorBoundaryState
> {
  state: MotionErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): MotionErrorBoundaryState {
    return { error: error.message };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error.message);
  }

  render() {
    if (this.state.error) {
      return (
        <MotionErrorFallback
          error={this.state.error}
          width={this.props.width}
          height={this.props.height}
        />
      );
    }
    return this.props.children;
  }
}

export function MotionCardOverlay({
  motionCard,
  durationInFrames: durationInFramesProp,
  width: widthProp,
  height: heightProp,
  subtitles,
}: MotionCardOverlayProps) {
  // useCurrentFrame 在 <Sequence> 内是 sequence-relative，正确无需修正。
  const frame = useCurrentFrame();
  // useVideoConfig 永远返回整个 composition 的配置，不会随 Sequence 变化，
  // 因此必须由父级把 sequence 本地的时长 / 容器尺寸显式传入并覆盖。
  const compConfig = useVideoConfig();
  const fps = compConfig.fps;
  const durationInFrames = Math.max(
    1,
    Number.isFinite(durationInFramesProp) && durationInFramesProp! > 0
      ? Math.round(durationInFramesProp!)
      : compConfig.durationInFrames,
  );
  const width =
    Number.isFinite(widthProp) && widthProp! > 0 ? Math.round(widthProp!) : compConfig.width;
  const height =
    Number.isFinite(heightProp) && heightProp! > 0 ? Math.round(heightProp!) : compConfig.height;

  const creation = useMemo(() => createMotion(motionCard.compiledCode), [
    motionCard.compiledCode,
  ]);

  if (!creation.component) {
    return (
      <MotionErrorFallback
        error={creation.error ?? '组件实例化失败'}
        width={width}
        height={height}
      />
    );
  }

  const MotionComponent = creation.component;
  const props: MotionComponentProps = {
    // 把 frame 也 clamp 到 sequence 长度内，避免 AI 代码越界 interpolate。
    frame: Math.min(Math.max(frame, 0), durationInFrames),
    fps,
    durationInFrames,
    width,
    height,
    subtitles: subtitles ?? EMPTY_SUBTITLES,
  };

  let renderedComponent: React.ReactNode;
  try {
    renderedComponent = <MotionComponent {...props} />;
  } catch (error) {
    return (
      <MotionErrorFallback
        error={(error as Error).message ?? '运行时错误'}
        width={width}
        height={height}
      />
    );
  }

  return (
    <MotionErrorBoundary width={width} height={height}>
      {renderedComponent}
    </MotionErrorBoundary>
  );
}
