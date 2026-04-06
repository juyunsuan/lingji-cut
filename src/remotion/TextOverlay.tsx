import type { CSSProperties } from 'react';
import { Sequence, useCurrentFrame } from 'remotion';
import type { OverlayItem } from '../types';
import { msToFrame } from '../lib/utils';
import { getTextAnimationStyle } from '../lib/text-animations';

interface TextOverlayProps {
  overlay: OverlayItem;
  fps: number;
}

export function TextOverlay({ overlay, fps }: TextOverlayProps) {
  const globalFrame = useCurrentFrame();
  const { textData } = overlay;
  if (!textData) return null;

  const startFrame = msToFrame(overlay.startMs, fps);
  const durationFrames = Math.max(1, msToFrame(overlay.durationMs, fps));
  // useCurrentFrame() 在 Sequence 外调用，返回全局帧号，需要转换为本地帧号
  const localFrame = Math.max(0, globalFrame - startFrame);
  const { style: animStyle, visibleText } = getTextAnimationStyle({
    frame: localFrame,
    fps,
    durationFrames,
    animation: textData.animation,
    content: textData.content,
  });

  const textStyle: CSSProperties = {
    position: 'absolute',
    left: overlay.position.x,
    top: overlay.position.y,
    width: overlay.position.width,
    height: overlay.position.height,
    fontFamily: textData.fontFamily,
    fontSize: textData.fontSize,
    color: textData.fontColor,
    fontWeight: textData.bold ? 'bold' : 'normal',
    fontStyle: textData.italic ? 'italic' : 'normal',
    textDecoration: textData.underline ? 'underline' : 'none',
    textAlign: textData.textAlign,
    backgroundColor: textData.backgroundColor,
    WebkitTextStroke:
      textData.strokeWidth > 0
        ? `${textData.strokeWidth}px ${textData.strokeColor}`
        : undefined,
    textShadow:
      textData.shadowBlur > 0 || textData.shadowOffsetX !== 0 || textData.shadowOffsetY !== 0
        ? `${textData.shadowOffsetX}px ${textData.shadowOffsetY}px ${textData.shadowBlur}px ${textData.shadowColor}`
        : undefined,
    letterSpacing: textData.letterSpacing,
    lineHeight: textData.lineHeight,
    opacity: (textData.opacity ?? 1) * (animStyle.opacity ?? 1),
    transform: [
      textData.rotation ? `rotate(${textData.rotation}deg)` : '',
      animStyle.transform ?? '',
    ]
      .filter(Boolean)
      .join(' ') || undefined,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent:
      textData.textAlign === 'center'
        ? 'center'
        : textData.textAlign === 'right'
          ? 'flex-end'
          : 'flex-start',
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
  };

  return (
    <Sequence from={msToFrame(overlay.startMs, fps)} durationInFrames={durationFrames}>
      <div style={textStyle}>{visibleText ?? textData.content}</div>
    </Sequence>
  );
}
