import { useMemo, type CSSProperties } from 'react';
import {
  appendCacheBuster,
  DEFAULT_WEB_CARD_BACKGROUND,
  normalizeWebCardSrcDoc,
} from '../lib/web-card';
import type { WebCardPayload } from '../types/ai';
import { resolveRemotionAssetSrc } from '../lib/remotion-assets';

interface WebCardOverlayProps {
  webCard: WebCardPayload;
  style?: CSSProperties;
}

export function WebCardOverlay({ webCard, style }: WebCardOverlayProps) {
  const iframeSource = useMemo(
    () =>
      webCard.src
        ? {
            src: appendCacheBuster(
              resolveRemotionAssetSrc(webCard.src),
              webCard.lastGeneratedAt,
            ),
          }
        : webCard.srcDoc
          ? { srcDoc: normalizeWebCardSrcDoc(webCard.srcDoc) }
          : null,
    [webCard.lastGeneratedAt, webCard.src, webCard.srcDoc],
  );
  const iframeKey = useMemo(() => {
    if (webCard.src) {
      return `${webCard.src}:${webCard.lastGeneratedAt ?? 0}`;
    }

    if (webCard.srcDoc) {
      return `${webCard.lastGeneratedAt ?? 0}:${webCard.srcDoc.length}`;
    }

    return 'empty';
  }, [webCard.lastGeneratedAt, webCard.src, webCard.srcDoc]);

  if (!iframeSource) {
    return null;
  }

  return (
    <iframe
      key={iframeKey}
      title="AI 网页卡片"
      {...iframeSource}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        background: DEFAULT_WEB_CARD_BACKGROUND,
        ...style,
      }}
    />
  );
}
