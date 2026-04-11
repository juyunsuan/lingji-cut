import { ExternalLink, FolderOpen, PlaySquare, Quote } from 'lucide-react';
import type { VideoImportPreviewDocument } from '../../lib/video-import-types';
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

export function VideoImportPreviewPane({
  document,
  filePath,
}: VideoImportPreviewPaneProps) {
  const segmentCount = document.transcript.segments.length;
  const lastSegment = document.transcript.segments[segmentCount - 1];
  const durationLabel = lastSegment ? formatTime(lastSegment.endMs) : '00:00';

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
              onClick={() => window.electronAPI.showItemInFolder(document.media.videoPath)}
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
              定位视频
            </button>
            <a
              href={document.metadata.resolvedPageUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                borderRadius: 10,
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-window-bg)',
                color: 'var(--color-text-primary)',
                padding: '8px 12px',
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={14} />
              打开来源页
            </a>
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
          <video
            controls
            preload="metadata"
            src={toFileSrc(document.media.videoPath)}
            poster={document.media.coverUrl ? toFileSrc(document.media.coverUrl) : undefined}
            style={{
              display: 'block',
              width: '100%',
              maxHeight: 420,
              background: '#000',
            }}
          />
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
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              minHeight: 0,
              overflowY: 'auto',
              paddingRight: 6,
            }}
          >
            {document.transcript.segments.map((segment, index) => (
              <div
                key={`${segment.startMs}-${index}`}
                style={{
                  borderRadius: 12,
                  border: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-window-bg)',
                  padding: '10px 12px',
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
            ))}

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
