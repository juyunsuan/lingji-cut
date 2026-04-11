import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
} from '../../ui';
import type { VideoImportProgress, VideoImportResult } from '../../lib/video-import-types';
import { getFileNameFromPath, toFileSrc } from '../../lib/utils';

interface DouyinImportDialogProps {
  open: boolean;
  busy: boolean;
  progress: VideoImportProgress | null;
  lastResult: VideoImportResult | null;
  errorMessage: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (url: string) => Promise<void>;
  onOpenPreview?: () => void;
}

export function DouyinImportDialog({
  open,
  busy,
  progress,
  lastResult,
  errorMessage,
  onOpenChange,
  onSubmit,
  onOpenPreview,
}: DouyinImportDialogProps) {
  const [url, setUrl] = useState('');
  const hasCompletedImport = Boolean(lastResult) && !busy;
  const canSubmit = Boolean(url.trim()) && !busy;

  useEffect(() => {
    if (!open) {
      setUrl('');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogClose />
        <DialogHeader>
          <DialogTitle>导入抖音视频</DialogTitle>
          <DialogDescription>
            输入抖音分享链接，系统会自动下载视频、提取音频并转录为当前项目的
            `original.md`。
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <textarea
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://v.douyin.com/..."
              rows={4}
              style={{
                width: '100%',
                borderRadius: 12,
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-window-bg)',
                color: 'var(--color-text-primary)',
                padding: '12px 14px',
                resize: 'vertical',
              }}
            />

            {progress ? (
              <div
                style={{
                  borderRadius: 12,
                  border: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-window-bg)',
                  padding: '12px 14px',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {progress.stepLabel}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {progress.progress}% · {progress.status}
                </div>
              </div>
            ) : null}

            {lastResult ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  borderRadius: 14,
                  border: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-panel-bg)',
                  padding: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.7,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  最近一次导入：{lastResult.title}，已写入 {lastResult.transcriptPath}
                </div>

                <div
                  style={{
                    borderRadius: 12,
                    overflow: 'hidden',
                    background: '#000',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <video
                    controls
                    preload="metadata"
                    src={toFileSrc(lastResult.videoPath)}
                    style={{
                      display: 'block',
                      width: '100%',
                      maxHeight: 260,
                      background: '#000',
                    }}
                  />
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '88px minmax(0, 1fr)',
                    gap: '8px 12px',
                    fontSize: 12,
                    lineHeight: 1.7,
                  }}
                >
                  <span style={{ color: 'var(--color-text-secondary)' }}>视频 ID</span>
                  <span style={{ color: 'var(--color-text-primary)' }}>{lastResult.videoId}</span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>来源链接</span>
                  <span style={{ color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>
                    {lastResult.sourceUrl}
                  </span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>预览文件</span>
                  <span style={{ color: 'var(--color-text-primary)' }}>
                    {getFileNameFromPath(lastResult.previewMetadataPath)}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button
                    variant="ghost"
                    onClick={() => window.electronAPI.showItemInFolder(lastResult.videoPath)}
                  >
                    查看目录
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => onOpenPreview?.()}
                    disabled={!onOpenPreview}
                  >
                    打开预览
                  </Button>
                </div>
              </div>
            ) : null}

            {errorMessage ? (
              <div
                style={{
                  borderRadius: 12,
                  background: 'color-mix(in srgb, #ff453a 12%, transparent)',
                  color: '#ffb4ab',
                  padding: '10px 12px',
                  fontSize: 12,
                  lineHeight: 1.6,
                }}
              >
                {errorMessage}
              </div>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {hasCompletedImport ? '立即关闭' : '取消'}
          </Button>
          {hasCompletedImport && !canSubmit ? (
            <Button
              variant="secondary"
              onClick={() => onOpenPreview?.()}
              disabled={!onOpenPreview}
            >
              打开预览
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => void onSubmit(url)}
              disabled={!canSubmit}
            >
              {busy ? '导入中…' : hasCompletedImport ? '再次导入' : '开始导入'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
