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

export interface MotionComponentProps {
  frame: number;
  fps: number;
  durationInFrames: number;
  width: number;
  height: number;
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
