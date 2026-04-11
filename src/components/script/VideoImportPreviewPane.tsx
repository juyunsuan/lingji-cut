import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, FolderOpen, PlaySquare, Quote } from 'lucide-react';
import type { VideoImportPreviewDocument, TranscriptSegment } from '../../lib/video-import-types';
import { formatTime, getFileNameFromPath, toFileSrc } from '../../lib/utils';

interface VideoImportPreviewPaneProps {
  document: VideoImportPreviewDocument;
  filePath: string;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '84px minmax(0, 1fr)',
        gap: 12,
        fontSize: 12,
        lineHeight: 1.6,
      }}
    >
      <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

const isMac = navigator.platform.toUpperCase().includes('MAC');

function findActiveSegmentIndex(
  segments: TranscriptSegment[],
  currentMs: number,
): number {
  for (let i = 0; i < segments.length; i++) {
    if (currentMs >= segments[i].startMs && currentMs < segments[i].endMs) {
      return i;
    }
  }
  return -1;
}

export function VideoImportPreviewPane({
  document,
  filePath,
}: VideoImportPreviewPaneProps) {
  const segmentCount = document.transcript.segments.length;
  const lastSegment = document.transcript.segments[segmentCount - 1];
  const durationLabel = lastSegment ? formatTime(lastSegment.endMs) : '00:00';

  const videoRef = useRef<HTMLVideoElement>(null);
  const segmentListRef = useRef<HTMLDivElement>(null);
  const activeSegmentRef = useRef<HTMLDivElement>(null);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);
  const [videoError, setVideoError] = useState(false);

  // 视频时间更新 → 字幕高亮同步
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const currentMs = video.currentTime * 1000;
    const idx = findActiveSegmentIndex(document.transcript.segments, currentMs);
    setActiveSegmentIndex(idx);
  }, [document.transcript.segments]);

  // 自动滚动到当前高亮字幕
  useEffect(() => {
    if (activeSegmentIndex < 0 || !activeSegmentRef.current || !segmentListRef.current) return;
    const container = segmentListRef.current;
    const target = activeSegmentRef.current;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    // 仅当元素不在可视区域内时滚动
    if (targetRect.top < containerRect.top || targetRect.bottom > containerRect.bottom) {
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeSegmentIndex]);

  // 点击字幕跳转视频时间
  const handleSegmentClick = useCallback((segment: TranscriptSegment) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = segment.startMs / 1000;
    if (video.paused) {
      video.play();
    }
  }, []);

  // 在 Finder/Explorer 中显示
  const handleShowInFolder = useCallback(() => {
    window.electronAPI.showItemInFolder(document.media.videoPath);
  }, [document.media.videoPath]);

  // 用系统默认浏览器打开来源页
  const handleOpenSourcePage = useCallback(() => {
    window.electronAPI.openExternal(document.metadata.resolvedPageUrl);
  }, [document.metadata.resolvedPageUrl]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(360px, 1.15fr) minmax(320px, 0.85fr)',
        gap: 20,
        height: '100%',
        padding: 20,
        overflow: 'hidden',
      }}
    >
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 8,
                padding: '5px 10px',
                borderRadius: 999,
                background: 'color-mix(in srgb, #ff6a3d 14%, transparent)',
                color: '#ffb69f',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.3,
              }}
            >
              <PlaySquare size={12} />
              抖音导入预览
            </div>
            <h3
              style={{
                margin: 0,
                fontSize: 22,
                lineHeight: 1.3,
                color: 'var(--color-text-primary)',
              }}
            >
              {document.title}
            </h3>
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: 'var(--color-text-secondary)',
              }}
            >
              {document.videoId} · {durationLabel} · {segmentCount} 段字幕
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleShowInFolder}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                borderRadius: 10,
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-window-bg)',
                color: 'var(--color-text-primary)',
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              <FolderOpen size={14} />
              {isMac ? '在 Finder 中显示' : '在资源管理器中显示'}
            </button>
            <button
              type="button"
              onClick={handleOpenSourcePage}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                borderRadius: 10,
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-window-bg)',
                color: 'var(--color-text-primary)',
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              <ExternalLink size={14} />
              打开来源页
            </button>
          </div>
        </div>

        <div
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            border: '1px solid var(--color-border-subtle)',
            background: '#000',
            minHeight: 240,
          }}
        >
          {videoError ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 240,
                color: 'var(--color-text-secondary)',
                fontSize: 13,
                gap: 8,
              }}
            >
              <span>视频文件加载失败</span>
              <span style={{ fontSize: 11 }}>{document.media.videoPath}</span>
            </div>
          ) : (
            <video
              ref={videoRef}
              controls
              preload="metadata"
              src={toFileSrc(document.media.videoPath)}
              poster={document.media.coverUrl ?? undefined}
              onTimeUpdate={handleTimeUpdate}
              onError={() => setVideoError(true)}
              style={{
                display: 'block',
                width: '100%',
                maxHeight: 420,
                background: '#000',
              }}
            />
          )}
        </div>

        <div
          style={{
            borderRadius: 16,
            border: '1px solid var(--color-border-subtle)',
            background: 'var(--color-panel-bg)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <MetaRow label="预览文件" value={filePath} />
          <MetaRow label="视频文件" value={getFileNameFromPath(document.media.videoPath)} />
          <MetaRow label="字幕文件" value={getFileNameFromPath(document.transcript.srtPath)} />
          <MetaRow label="原稿同步" value={document.syncedToOriginal ? '已同步到 original.md' : '未同步'} />
          <MetaRow label="导入时间" value={document.createdAt} />
          <MetaRow label="分享链接" value={document.metadata.sourceUrl} />
        </div>
      </section>

      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          minHeight: 0,
        }}
      >
        <div
          style={{
            borderRadius: 16,
            border: '1px solid var(--color-border-subtle)',
            background: 'var(--color-panel-bg)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--color-text-primary)',
              fontWeight: 700,
            }}
          >
            <Quote size={16} />
            字幕与转录
          </div>

          <div
            ref={segmentListRef}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              minHeight: 0,
              overflowY: 'auto',
              paddingRight: 6,
            }}
          >
            {document.transcript.segments.map((segment, index) => {
              const isActive = index === activeSegmentIndex;
              return (
                <div
                  key={`${segment.startMs}-${index}`}
                  ref={isActive ? activeSegmentRef : undefined}
                  onClick={() => handleSegmentClick(segment)}
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${isActive ? 'var(--color-system-blue)' : 'var(--color-border-subtle)'}`,
                    background: isActive
                      ? 'color-mix(in srgb, var(--color-system-blue) 10%, var(--color-window-bg))'
                      : 'var(--color-window-bg)',
                    padding: '10px 12px',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                >
                  <div
                    style={{
                      marginBottom: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      color: isActive ? 'var(--color-system-blue)' : 'var(--color-text-secondary)',
                      transition: 'color 0.2s',
                    }}
                  >
                    {formatTime(segment.startMs)} - {formatTime(segment.endMs)}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.7,
                      color: 'var(--color-text-primary)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {segment.text}
                  </div>
                </div>
              );
            })}

            <div
              style={{
                borderRadius: 12,
                border: '1px dashed var(--color-border-subtle)',
                background: 'color-mix(in srgb, var(--color-panel-bg) 70%, transparent)',
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  marginBottom: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--color-text-secondary)',
                }}
              >
                完整文稿
              </div>
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.8,
                  color: 'var(--color-text-primary)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {document.transcript.text}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
