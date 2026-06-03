import { AbsoluteFill } from 'remotion';
import type { CSSProperties } from 'react';
import type { OverlayItem } from '../../types';
import { LegacyCard } from './LegacyCard';
import { CardHost } from '../card-host';

export function AICardOverlay({ overlay, zIndex }: { overlay: OverlayItem; zIndex: number }) {
  const card = overlay.aiCardData;
  if (!card) return null;

  const fullscreen = card.displayMode === 'fullscreen';
  const wrapper: CSSProperties = fullscreen
    ? { position: 'absolute', inset: 0, zIndex, overflow: 'hidden' }
    : {
        position: 'absolute',
        left: overlay.position.x,
        top: overlay.position.y,
        width: overlay.position.width,
        height: overlay.position.height,
        zIndex,
        overflow: 'hidden',
        borderRadius: 18,
        boxShadow: '0 10px 30px rgba(0,0,0,.45)',
      };

  const tsx = card.renderMode === 'motion-card' ? card.motionCard?.tsx : undefined;
  if (card.renderMode === 'motion-card' && !tsx?.trim()) {
    return (
      <AbsoluteFill style={wrapper}>
        <LegacyCard title={card.title} />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={wrapper}>
      <CardHost overlayId={overlay.id} tsx={tsx ?? ''} />
    </AbsoluteFill>
  );
}
