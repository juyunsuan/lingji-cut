import type { CSSProperties } from 'react';
import styles from '../Timeline.module.css';

export interface TrackDropZoneProps {
  position: 'top' | 'bottom';
  active: boolean;
  highlighted: boolean;
  width: number;
  left: number;
  /** 相对 content 容器的垂直定位；沿用 spec 里 -36px 偏移 */
  top?: number | undefined;
  bottom?: number | undefined;
}

/**
 * 拖拽 overlay 时显示在轨道区顶部 / 底部的"释放以新建轨道"虚线框。
 * 仅在 Timeline.tsx 的拖拽状态生效时渲染。
 */
export function TrackDropZone({
  position,
  active,
  highlighted,
  width,
  left,
  top,
  bottom,
}: TrackDropZoneProps) {
  if (!active) return null;
  const style: CSSProperties = {
    width,
    left,
    opacity: highlighted ? 1 : 0.65,
  };
  if (top !== undefined) style.top = top;
  if (bottom !== undefined) style.bottom = bottom;

  const className = [
    styles.trackDropZone,
    position === 'top' ? styles.trackDropZoneTop : styles.trackDropZoneBottom,
    highlighted ? styles.trackDropZoneHighlighted : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className} style={style} data-drop-position={position}>
      <span>释放以新建轨道</span>
    </div>
  );
}
