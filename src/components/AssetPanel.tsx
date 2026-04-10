import { useCallback, useState } from 'react';
import type { AssetItem, AssetType } from '../types';
import { useTimelineStore } from '../store/timeline';
import type { PillGroupItem } from '../ui';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Eyebrow,
  ModalFooter,
  PillGroup,
  SearchInput,
} from '../ui';
import { AppIcon } from './AppIcon';
import { AssetCard, AssetImportCard } from './AssetCard';
import styles from './AssetPanel.module.css';

type AssetFilterKey = 'all' | AssetType;

const FILTER_OPTIONS: Array<PillGroupItem<AssetFilterKey>> = [
  { value: 'all', label: '全部' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'text', label: '文字' },
];

function matchesAssetFilter(asset: AssetItem, filter: AssetFilterKey, keyword: string): boolean {
  const normalizedKeyword = keyword.trim().toLowerCase();

  if (filter !== 'all' && asset.type !== filter) {
    return false;
  }

  if (!normalizedKeyword) {
    return true;
  }

  return asset.name.toLowerCase().includes(normalizedKeyword);
}

function getPathFileName(path: string): string {
  if (!path) {
    return '';
  }
  const normalizedPath = path.replace(/\\/g, '/');
  return normalizedPath.split('/').pop() ?? '';
}

function PodcastResourceSection({
  compact,
  expanded,
  onToggleExpanded,
  audioPath,
  srtPath,
  onReplaceAudio,
  onReplaceSrt,
}: {
  compact: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  audioPath: string;
  srtPath: string;
  onReplaceAudio?: () => Promise<void>;
  onReplaceSrt?: () => Promise<void>;
}) {
  const audioName = getPathFileName(audioPath);
  const srtName = getPathFileName(srtPath);

  return (
    <section className={styles.podcastSection} aria-label="口播资源">
      <button
        type="button"
        className={styles.podcastSectionToggle}
        aria-expanded={expanded}
        onClick={onToggleExpanded}
      >
        <span className={styles.podcastSectionTitle}>
          <AppIcon
            name={expanded ? 'chevron-down' : 'chevron-right'}
            size={12}
            className={styles.podcastSectionChevron}
          />
          <span>口播资源</span>
        </span>
        {compact ? (
          <span className={styles.podcastSectionSummary}>
            {audioName || srtName ? '已配置' : '未设置'}
          </span>
        ) : null}
      </button>
      {expanded ? (
        <div className={styles.podcastSectionBody}>
          <div className={styles.podcastRow}>
            <span className={styles.podcastRowIcon}>
              <AppIcon name="music" size={13} />
            </span>
            <span
              className={[
                styles.podcastRowName,
                audioName ? '' : styles.podcastRowNameEmpty,
              ].join(' ')}
              title={audioName || '未设置音频'}
            >
              {audioName || '未设置音频'}
            </span>
            <button
              type="button"
              className={styles.podcastRowAction}
              onClick={() => void onReplaceAudio?.()}
            >
              {audioName ? '替换音频' : '+ 添加'}
            </button>
          </div>
          <div className={styles.podcastRow}>
            <span className={styles.podcastRowIcon}>
              <AppIcon name="file-text" size={13} />
            </span>
            <span
              className={[
                styles.podcastRowName,
                srtName ? '' : styles.podcastRowNameEmpty,
              ].join(' ')}
              title={srtName || '未设置字幕'}
            >
              {srtName || '未设置字幕'}
            </span>
            <button
              type="button"
              className={styles.podcastRowAction}
              onClick={() => void onReplaceSrt?.()}
            >
              {srtName ? '替换字幕' : '+ 添加'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function AssetPanel({
  compact,
  railHeight,
  onAddAsset,
  onOpenSubtitleInspector,
  onAddTextOverlay,
  onUseAsPodcastAudio,
  onUseAsPodcastSrt,
  onReplaceAudio,
  onReplaceSrt,
  showAIClip,
  onStartAIClip,
}: {
  compact: boolean;
  railHeight?: number;
  onAddAsset?: () => Promise<void>;
  onOpenSubtitleInspector?: () => void;
  onAddTextOverlay?: () => void;
  onUseAsPodcastAudio?: (path: string, durationMs: number) => Promise<void>;
  onUseAsPodcastSrt?: (path: string) => Promise<void>;
  onReplaceAudio?: () => Promise<void>;
  onReplaceSrt?: () => Promise<void>;
  showAIClip?: boolean;
  onStartAIClip?: () => void;
}) {
  const { addAsset, assets, removeAsset, timeline } = useTimelineStore();
  const [keyword, setKeyword] = useState('');
  const [activeFilter, setActiveFilter] = useState<AssetFilterKey>('all');
  const [pendingRemovalPath, setPendingRemovalPath] = useState<string | null>(null);
  const [podcastExpanded, setPodcastExpanded] = useState(!compact);

  const handleAddAsset = useCallback(async () => {
    if (onAddAsset) {
      await onAddAsset();
      return;
    }

    const asset = await window.electronAPI.addAsset();
    if (!asset) {
      return;
    }

    addAsset(asset.path, asset.type, asset.durationMs);
  }, [addAsset, onAddAsset]);

  const getAssetUsageCount = useCallback(
    (path: string) => timeline.overlays.filter((overlay) => overlay.assetPath === path).length,
    [timeline.overlays],
  );

  const handleRemoveAsset = useCallback(
    (path: string) => {
      const usageCount = getAssetUsageCount(path);
      if (usageCount > 0) {
        setPendingRemovalPath(path);
        return;
      }

      removeAsset(path);
    },
    [getAssetUsageCount, removeAsset],
  );

  const visibleAssets = assets.filter((asset) =>
    matchesAssetFilter(asset, activeFilter, compact ? '' : keyword),
  );
  const pendingRemovalUsageCount = pendingRemovalPath ? getAssetUsageCount(pendingRemovalPath) : 0;

  return (
    <aside
      className={[styles.root, compact ? styles.compact : styles.regular].join(' ')}
    >
      {showAIClip && onStartAIClip ? (
        <button type="button" className={styles.aiClipButton} onClick={onStartAIClip}>
          <AppIcon name="sparkles" size={13} />
          <span>AI 一键剪辑</span>
        </button>
      ) : null}
      <PodcastResourceSection
        compact={compact}
        expanded={podcastExpanded}
        onToggleExpanded={() => setPodcastExpanded((current) => !current)}
        audioPath={timeline.podcast?.audioPath ?? ''}
        srtPath={timeline.podcast?.srtPath ?? ''}
        onReplaceAudio={onReplaceAudio}
        onReplaceSrt={onReplaceSrt}
      />

      {/* 搜索栏 — compact 时通过 CSS 隐藏 */}
      {!compact && (
        <div className={styles.searchWrap}>
          <SearchInput
            size="sm"
            value={keyword}
            placeholder="搜索素材…"
            aria-label="搜索素材"
            wrapperClassName={styles.searchInputWrap}
            className={styles.searchInput}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
      )}

      {/* 筛选 pill — compact 时隐藏 */}
      {!compact && (
        <div className={styles.filterRow}>
          <PillGroup
            items={FILTER_OPTIONS}
            value={activeFilter}
            onChange={setActiveFilter}
            size="sm"
            wrap={false}
            className={styles.filterGroup}
            itemClassName={styles.filterPill}
          />
        </div>
      )}

      {/* compact 模式下的计数摘要 */}
      {compact && (
        <div className={styles.compactSummary}>素材库 · {visibleAssets.length} 项</div>
      )}

      {/* 素材网格 / 文字添加按钮 */}
      <div
        className={[
          styles.content,
          compact ? styles.contentCompact : '',
        ].filter(Boolean).join(' ')}
      >
        {activeFilter === 'text' ? (
          /* 文字 tab — 仅显示添加按钮 */
          <button className={styles.addTextButton} onClick={onAddTextOverlay}>
            <AppIcon name="type" size={20} color="#10b981" />
            <span>添加文字</span>
            <span className={styles.addTextHint}>在时间轴当前位置添加</span>
          </button>
        ) : (
          <div className={compact ? styles.gridCompact : styles.grid}>
            {visibleAssets.map((asset) => {
              const actionLabel =
                asset.type === 'audio'
                  ? '设为音频轨'
                  : asset.type === 'srt'
                    ? '设为字幕轨'
                    : null;
              const handleAssetAction =
                asset.type === 'audio'
                  ? () => void onUseAsPodcastAudio?.(asset.path, asset.durationMs)
                  : asset.type === 'srt'
                    ? () => void onUseAsPodcastSrt?.(asset.path)
                    : undefined;

              return (
                <div key={asset.path} className={styles.assetSlot}>
                  <AssetCard
                    asset={asset}
                    compact={compact}
                    usageCount={getAssetUsageCount(asset.path)}
                    onRemove={handleRemoveAsset}
                    onClick={asset.type === 'srt' ? onOpenSubtitleInspector : undefined}
                    onDragStart={(event) => {
                      if (asset.locked) {
                        event.preventDefault();
                        return;
                      }
                      if (asset.type !== 'image' && asset.type !== 'video' && asset.type !== 'text') {
                        event.preventDefault();
                        return;
                      }
                      event.dataTransfer.effectAllowed = 'copy';
                      event.dataTransfer.setData('application/json', JSON.stringify(asset));
                    }}
                  />
                  {actionLabel && handleAssetAction ? (
                    <button
                      type="button"
                      className={styles.assetAction}
                      onClick={handleAssetAction}
                    >
                      {actionLabel}
                    </button>
                  ) : null}
                </div>
              );
            })}

            {/* 导入 ghost 卡片 — 始终显示在末尾 */}
            <AssetImportCard onClick={() => void handleAddAsset()} />
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      <Dialog
        open={Boolean(pendingRemovalPath)}
        onOpenChange={(open) => !open && setPendingRemovalPath(null)}
      >
        <DialogContent>
          <DialogHeader>
            <Eyebrow>REMOVE ASSET</Eyebrow>
            <DialogTitle>删除素材</DialogTitle>
            <DialogDescription>
              {pendingRemovalPath
                ? `该素材已在底部轨道中使用 ${pendingRemovalUsageCount} 次，删除后会同步移除所有相关轨道块。`
                : undefined}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div>确认继续吗？</div>
          </DialogBody>
          <DialogFooter>
            <ModalFooter
              cancelLabel="取消"
              confirmLabel="确认删除"
              confirmVariant="danger"
              onCancel={() => setPendingRemovalPath(null)}
              onConfirm={() => {
                if (pendingRemovalPath) {
                  removeAsset(pendingRemovalPath);
                }
                setPendingRemovalPath(null);
              }}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
