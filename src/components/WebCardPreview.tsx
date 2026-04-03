import { useMemo } from 'react';
import { appendCacheBuster, normalizeWebCardSrcDoc } from '../lib/web-card';
import type { WebCardPayload } from '../types/ai';
import { toFileSrc } from '../lib/utils';
import { LoadingSpinner } from './LoadingSpinner';

const DEFAULT_STAGE_WIDTH = 1_920;
const DEFAULT_STAGE_HEIGHT = 1_080;

interface WebCardPreviewProps {
  webCard?: WebCardPayload;
  stageWidth?: number;
  stageHeight?: number;
  isLoading?: boolean;
  loadingLabel?: string;
}

export function WebCardPreview({
  webCard,
  stageWidth = DEFAULT_STAGE_WIDTH,
  stageHeight = DEFAULT_STAGE_HEIGHT,
  isLoading = false,
  loadingLabel = '正在生成网页卡片...',
}: WebCardPreviewProps) {
  const aspectRatio = useMemo(
    () => `${Math.max(1, stageWidth)} / ${Math.max(1, stageHeight)}`,
    [stageHeight, stageWidth],
  );
  const iframeSource = useMemo(
    () =>
      webCard?.src
        ? { src: appendCacheBuster(toFileSrc(webCard.src), webCard.lastGeneratedAt) }
        : webCard?.srcDoc
          ? { srcDoc: normalizeWebCardSrcDoc(webCard.srcDoc, stageWidth, stageHeight) }
          : null,
    [stageHeight, stageWidth, webCard?.lastGeneratedAt, webCard?.src, webCard?.srcDoc],
  );
  const iframeKey = useMemo(() => {
    if (webCard?.src) {
      return `${webCard.src}:${webCard.lastGeneratedAt ?? 0}`;
    }

    if (webCard?.srcDoc) {
      return `${webCard.lastGeneratedAt ?? 0}:${webCard.srcDoc.length}`;
    }

    return 'empty';
  }, [webCard?.lastGeneratedAt, webCard?.src, webCard?.srcDoc]);
  const showLoading = isLoading || webCard?.runtimeStatus === 'loading';

  return (
    <div
      style={{
        ...frameShellStyle,
        aspectRatio,
      }}
      aria-busy={showLoading || undefined}
    >
      {iframeSource ? (
        <iframe key={iframeKey} title="网页卡片预览" {...iframeSource} style={frameStyle} />
      ) : (
        <div style={emptyStyle}>网页卡片预览将在分析或单卡重生成后显示</div>
      )}
      {showLoading ? (
        <div style={loadingOverlayStyle} role="status" aria-live="polite">
          <div style={loadingCardStyle}>
            <LoadingSpinner size={16} color="#ffffff" />
            <span>{loadingLabel}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const frameShellStyle = {
  width: '100%',
  position: 'relative' as const,
  overflow: 'hidden' as const,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.08)',
  background:
    'radial-gradient(circle at top, rgba(148,163,184,0.12) 0%, rgba(2,6,23,0.96) 72%)',
};

const frameStyle = {
  position: 'absolute' as const,
  inset: 0,
  width: '100%',
  height: '100%',
  border: 'none',
  background: '#020617',
  display: 'block',
  pointerEvents: 'none' as const,
};

const emptyStyle = {
  position: 'absolute' as const,
  inset: 0,
  borderRadius: 16,
  border: '1px dashed rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.02)',
  color: '#94a3b8',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center' as const,
  padding: 20,
  boxSizing: 'border-box' as const,
};

const loadingOverlayStyle = {
  position: 'absolute' as const,
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(2,6,23,0.56)',
  backdropFilter: 'blur(8px)',
};

const loadingCardStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 14px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(15,23,42,0.82)',
  color: '#f8fafc',
  fontSize: 13,
  fontWeight: 600,
};
