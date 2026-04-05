import { useMemo } from 'react';
import { appendCacheBuster, normalizeWebCardSrcDoc } from '../lib/web-card';
import type { WebCardPayload } from '../types/ai';
import { toFileSrc } from '../lib/utils';
import { LoadingOverlay } from '../ui';
import styles from './WebCardPreview.module.css';

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
      className={styles.root}
      style={{ aspectRatio }}
      aria-busy={showLoading || undefined}
    >
      {iframeSource ? (
        <iframe key={iframeKey} title="网页卡片预览" {...iframeSource} className={styles.frame} />
      ) : (
        <div className={styles.empty}>网页卡片预览将在分析或单卡重生成后显示</div>
      )}
      <LoadingOverlay visible={showLoading} label={loadingLabel} />
    </div>
  );
}
