import React from 'react';
import * as Remotion from 'remotion';
import { CameraMotionBlur } from '@remotion/motion-blur';
import { noise2D, noise3D } from '@remotion/noise';
import * as mediaUtils from '@remotion/media-utils';
import * as pathHelpers from '@remotion/paths';
import * as shapes from '@remotion/shapes';
import * as transitions from '@remotion/transitions';
import type { MotionComponentProps } from '../types/motion';

function readOptionalModuleExport<T extends object, K extends PropertyKey>(
  namespace: T,
  key: K,
): unknown {
  return key in namespace ? (namespace as Record<PropertyKey, unknown>)[key] : undefined;
}

const CORE_SANDBOX = {
  React,
  interpolate: readOptionalModuleExport(Remotion, 'interpolate'),
  interpolateColors: readOptionalModuleExport(Remotion, 'interpolateColors'),
  spring: readOptionalModuleExport(Remotion, 'spring'),
  Easing: readOptionalModuleExport(Remotion, 'Easing'),
  random: readOptionalModuleExport(Remotion, 'random'),
  useCurrentFrame: readOptionalModuleExport(Remotion, 'useCurrentFrame'),
  useVideoConfig: readOptionalModuleExport(Remotion, 'useVideoConfig'),
  delayRender: readOptionalModuleExport(Remotion, 'delayRender'),
  continueRender: readOptionalModuleExport(Remotion, 'continueRender'),
  AbsoluteFill: readOptionalModuleExport(Remotion, 'AbsoluteFill'),
  Sequence: readOptionalModuleExport(Remotion, 'Sequence'),
  Series: readOptionalModuleExport(Remotion, 'Series'),
  Loop: readOptionalModuleExport(Remotion, 'Loop'),
  Img: readOptionalModuleExport(Remotion, 'Img'),
  OffthreadVideo: readOptionalModuleExport(Remotion, 'OffthreadVideo'),
  Audio: readOptionalModuleExport(Remotion, 'Audio'),
  IFrame: readOptionalModuleExport(Remotion, 'IFrame'),
  staticFile: readOptionalModuleExport(Remotion, 'staticFile'),
  noise2D,
  noise3D,
  CameraMotionBlur,
};

export const MOTION_SANDBOX = Object.freeze({
  ...CORE_SANDBOX,
  ...shapes,
  ...pathHelpers,
  ...transitions,
  createSmoothSvgPath: mediaUtils.createSmoothSvgPath,
  getWaveformPortion: mediaUtils.getWaveformPortion,
  visualizeAudio: mediaUtils.visualizeAudio,
});

function createCompatGlobalScope(base: object | undefined) {
  const scope = Object.create(base ?? null) as Record<string, unknown>;
  scope.React = React;
  scope.Remotion = MOTION_SANDBOX;
  return Object.freeze(scope);
}

const MOTION_WINDOW_COMPAT = createCompatGlobalScope(
  typeof window === 'object' ? window : undefined,
);
const MOTION_GLOBAL_COMPAT = createCompatGlobalScope(
  typeof globalThis === 'object' ? globalThis : undefined,
);

const MOTION_RUNTIME_SCOPE = Object.freeze({
  ...MOTION_SANDBOX,
  window: MOTION_WINDOW_COMPAT,
  globalThis: MOTION_GLOBAL_COMPAT,
  self: MOTION_WINDOW_COMPAT,
});

export const SANDBOX_API_KEYS = Object.freeze(Object.keys(MOTION_SANDBOX).sort());

const RECOMMENDED_SANDBOX_API_KEYS = [
  'React',
  'AbsoluteFill',
  'Sequence',
  'interpolate',
  'interpolateColors',
  'spring',
  'Easing',
  'Img',
  'Audio',
  'Rect',
  'Circle',
  'Ellipse',
  'Polygon',
  'Triangle',
  'Star',
  'makeRect',
  'makeCircle',
  'makeTriangle',
  'interpolatePath',
  'serializeInstructions',
  'createSmoothSvgPath',
].filter((key) => SANDBOX_API_KEYS.includes(key));

export const MOTION_SANDBOX_REFERENCE = [
  `推荐 API：${RECOMMENDED_SANDBOX_API_KEYS.join(', ')}`,
  '可用但慎用：Loop, Series, random, noise2D, noise3D, staticFile, OffthreadVideo',
  '不要使用：useCurrentFrame, useVideoConfig, delayRender, continueRender, IFrame, CameraMotionBlur',
  '组件 props：{ frame, fps, durationInFrames, width, height, subtitles }；其中 subtitles 是 { startMs, endMs, text, relativeStartFrame, relativeEndFrame }[]，按时间升序，relativeStartFrame/relativeEndFrame 已对齐当前卡片起点；当 subtitles.length===0 时回退到等分 beats 节奏。',
].join('\n');

export function formatMotionRuntimeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function createMotionComponent(
  compiledCode: string,
): React.ComponentType<MotionComponentProps> {
  const factory = new Function(
    '__motionSandbox',
    `with (__motionSandbox) {
${compiledCode}
return typeof MotionComponent === 'function' ? MotionComponent : null;
}`,
  );
  const component = factory(MOTION_RUNTIME_SCOPE);

  if (typeof component !== 'function') {
    throw new Error('编译结果中未找到 MotionComponent');
  }

  return component as React.ComponentType<MotionComponentProps>;
}
