export interface MotionCardPayload {
  sourceCode: string;
  compiledCode: string;
  compiledAt: number;
  compileError?: string;
  prompt: string;
  retryCount: number;
}

export type MotionTemplateKey =
  | 'kpi-countup'
  | 'bar-chart-reveal'
  | 'ranking-stack'
  | 'before-after-compare'
  | 'step-flow-explainer'
  | 'chapter-stinger';

/**
 * 单行字幕注入到 Motion Card 运行时。
 * relativeStartFrame / relativeEndFrame 已经换算为相对于当前卡片 Sequence 起点的帧号，
 * 方便 LLM 生成的代码用 frame 直接做 interpolate，而不需要再做 ms→frame 换算。
 */
export interface MotionSubtitleCue {
  startMs: number;
  endMs: number;
  text: string;
  relativeStartFrame: number;
  relativeEndFrame: number;
}

export interface MotionComponentProps {
  frame: number;
  fps: number;
  durationInFrames: number;
  width: number;
  height: number;
  /**
   * 当前卡片时间窗内的字幕行（按 relativeStartFrame 升序）。
   * 用于让 Motion Card 的入场 / 数字增长 / 表格展开等动画严格跟随讲述节奏，
   * 而不是用固定的 12-24 帧硬时序。
   */
  subtitles: MotionSubtitleCue[];
}

export interface MotionAssetInfo {
  name: string;
  type: 'image' | 'video' | 'audio' | 'other';
  path?: string;
}

export interface MotionCanvasSize {
  width: number;
  height: number;
}

export interface MotionCompileSuccess {
  success: true;
  compiledCode: string;
}

export interface MotionCompileFailure {
  success: false;
  error: string;
}

export type MotionCompileResult = MotionCompileSuccess | MotionCompileFailure;

export interface MotionCardResult {
  success: boolean;
  sourceCode?: string;
  compiledCode?: string;
  error?: string;
  retryCount: number;
}

export interface MotionGenerateParams {
  prompt: string;
  durationMs?: number;
  displayMode?: 'fullscreen' | 'pip';
  canvasSize?: MotionCanvasSize;
  assets?: MotionAssetInfo[];
}

export interface MotionModifyParams {
  sourceCode: string;
  instruction: string;
}
