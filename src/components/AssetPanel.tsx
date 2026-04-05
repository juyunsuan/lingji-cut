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
import { AssetCard, AssetImportCard } from './AssetCard';
import styles from './AssetPanel.module.css';

type AssetFilterKey = 'all' | AssetType;

const FILTER_OPTIONS: Array<PillGroupItem<AssetFilterKey>> = [
  { value: 'all', label: '全部' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
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

export function AssetPanel({
  compact,
  railHeight,
  onAddAsset,
}: {
  compact: boolean;
  railHeight?: number;
  onAddAsset?: () => Promise<void>;
}) {
  const { addAsset, assets, removeAsset, timeline } = useTimelineStore();
  const [keyword, setKeyword] = useState('');
  const [activeFilter, setActiveFilter] = useState<AssetFilterKey>('all');
  const [pendingRemovalPath, setPendingRemovalPath] = useState<string | null>(null);

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
      {/* 搜索栏 — compact 时通过 CSS 隐藏 */}
      {!compact && (
        <div className={styles.searchWrap}>
          <SearchInput
            size="sm"
            value={keyword}
            placeholder="搜索素材…"
            aria-label="搜索素材"
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
          />
        </div>
      )}

      {/* compact 模式下的计数摘要 */}
      {compact && (
        <div className={styles.compactSummary}>素材库 · {visibleAssets.length} 项</div>
      )}

      {/* 素材网格 */}
      <div
        className={[
          styles.content,
          compact ? styles.contentCompact : '',
        ].filter(Boolean).join(' ')}
      >
        <div className={compact ? styles.gridCompact : styles.grid}>
          {visibleAssets.map((asset) => (
            <AssetCard
              key={asset.path}
              asset={asset}
              compact={compact}
              usageCount={getAssetUsageCount(asset.path)}
              onRemove={handleRemoveAsset}
              onDragStart={(event) => {
                if (asset.locked || (asset.type !== 'image' && asset.type !== 'video')) {
                  event.preventDefault();
                  return;
                }

                event.dataTransfer.effectAllowed = 'copy';
                event.dataTransfer.setData('application/json', JSON.stringify(asset));
              }}
            />
          ))}

          {/* 导入 ghost 卡片 — 始终显示在末尾 */}
          <AssetImportCard onClick={() => void handleAddAsset()} />
        </div>
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

