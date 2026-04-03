import type { DragEvent } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useViewportSize } from '../hooks/useViewportSize';
import { getDroppedFilePath, getImportFileError, type ImportKind } from '../lib/import-files';
import { getSetupLayoutMode } from '../lib/layout';
import { getFileNameFromPath } from '../lib/utils';
import { Badge, Button } from '../ui/primitives';

interface SetupProps {
  busy: boolean;
  errorMessage: string | null;
  onComplete: (audioPath: string, srtPath: string) => Promise<void>;
}

function DropCard({
  label,
  helper,
  value,
  accentColor,
  icon,
  selectLabel,
  onPickFile,
  onDrop,
  compact,
}: {
  label: string;
  helper: string;
  value: string | null;
  accentColor: string;
  icon: string;
  selectLabel: string;
  onPickFile: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  compact: boolean;
}) {
  return (
    <div
      onDrop={onDrop}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      style={{
        width: '100%',
        minHeight: compact ? 184 : 220,
        borderRadius: 20,
        border: `1px solid ${value ? accentColor : 'rgba(255,255,255,0.12)'}`,
        background: value
          ? `linear-gradient(180deg, ${accentColor}20 0%, rgba(255,255,255,0.04) 100%)`
          : 'rgba(255,255,255,0.03)',
        padding: compact ? 18 : 24,
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 12 : 16,
      }}
    >
      <div
        style={{
          width: compact ? 44 : 52,
          height: compact ? 44 : 52,
          borderRadius: 16,
          display: 'grid',
          placeItems: 'center',
          background: `${accentColor}22`,
          fontSize: compact ? 22 : 26,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12, letterSpacing: '0.16em', color: accentColor }}>{label}</div>
        <h2 style={{ margin: '8px 0 6px', fontSize: compact ? 20 : 24 }}>{helper}</h2>
      </div>
      <div
        style={{
          marginTop: 'auto',
          borderRadius: 16,
          border: '1px dashed rgba(255,255,255,0.12)',
          padding: compact ? '12px 14px' : '16px 18px',
          color: value ? '#f5f7fb' : '#93a4bf',
          fontSize: compact ? 13 : 14,
          minHeight: compact ? 46 : 54,
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          wordBreak: 'break-all',
        }}
      >
        {value ? getFileNameFromPath(value) : '把文件从 Finder 直接拖到这里'}
      </div>

      <Button
        type="button"
        onClick={onPickFile}
        variant="secondary"
        style={{
          height: 42,
          borderColor: `${accentColor}55`,
          background: `${accentColor}18`,
        }}
      >
        {selectLabel}
      </Button>
    </div>
  );
}

export function Setup({ busy, errorMessage, onComplete }: SetupProps) {
  const viewport = useViewportSize();
  const layout = getSetupLayoutMode(viewport.width, viewport.height);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [srtPath, setSrtPath] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const canStart = useMemo(() => Boolean(audioPath && srtPath && !busy), [audioPath, busy, srtPath]);

  const applyImportPath = useCallback((kind: ImportKind, filePath: string) => {
    const validationError = getImportFileError(filePath, kind);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(null);
    if (kind === 'audio') {
      setAudioPath(filePath);
      return;
    }

    setSrtPath(filePath);
  }, []);

  const createDropHandler = useCallback(
    (kind: ImportKind) => (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const file = event.dataTransfer.files[0] as (File & { path?: string }) | undefined;
      if (!file) {
        return;
      }

      const filePath = getDroppedFilePath(file, window.electronAPI.getPathForFile);
      if (!filePath) {
        setLocalError('未能读取拖入文件的本地路径，请改用“选择文件”按钮或重试拖拽。');
        return;
      }

      applyImportPath(kind, filePath);
    },
    [applyImportPath],
  );

  const createSelectHandler = useCallback(
    (kind: ImportKind) => async () => {
      const filePath = await window.electronAPI.selectSetupFile(kind);
      if (!filePath) {
        return;
      }

      applyImportPath(kind, filePath);
    },
    [applyImportPath],
  );

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateRows: '1fr auto',
        background:
          'radial-gradient(circle at top left, rgba(123,213,255,0.12), transparent 26%), radial-gradient(circle at top right, rgba(255,181,71,0.12), transparent 24%)',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: layout.stackColumns
            ? 'minmax(0, 1fr)'
            : 'minmax(0, 1.08fr) minmax(420px, 0.92fr)',
          gap: layout.stackColumns ? 24 : 32,
          padding: `${layout.compactHero ? 22 : 48}px clamp(18px, 4vw, 52px) 24px`,
          alignItems: 'start',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            order: layout.stackColumns ? 2 : 1,
          }}
        >
          <div>
            <div style={{ fontSize: 13, letterSpacing: '0.22em', color: '#7bd5ff' }}>
              LOCAL PODCAST VIDEO EDITOR
            </div>
            <h1
              style={{
                margin: '18px 0 12px',
                fontSize: layout.compactHero ? 'clamp(32px, 7vw, 42px)' : 'clamp(42px, 6vw, 54px)',
                lineHeight: 1.05,
              }}
            >
              给口播音频
              <br />
              搭一条可编辑的视频时间轴
            </h1>
            <p
              style={{
                maxWidth: layout.stackColumns ? '100%' : 560,
                color: '#9baec9',
                fontSize: layout.compactHero ? 15 : 16,
                lineHeight: 1.8,
              }}
            >
              先导入 MP3 和匹配的 SRT。进入编辑器后，你可以把图片和视频拖到时间轴里，
              用同一份时间线驱动 Remotion 预览和 MP4 导出。
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${layout.featureColumns}, minmax(0, 1fr))`,
              gap: 16,
              marginTop: layout.compactHero ? 24 : 40,
            }}
          >
            {[
              ['01', '导入口播', '拖拽 MP3 与 SRT，自动解析字幕时长'],
              ['02', '叠加素材', '把图片或视频拖到时间轴目标时间点'],
              ['03', '实时导出', '预览与 renderMedia 共用一套 inputProps'],
            ].map(([index, title, description]) => (
              <div
                key={index}
                style={{
                  padding: 18,
                  borderRadius: 18,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ color: '#ffb547', fontSize: 12, letterSpacing: '0.14em' }}>{index}</div>
                <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700 }}>{title}</div>
                <div style={{ marginTop: 8, color: '#91a2bc', fontSize: 14, lineHeight: 1.6 }}>
                  {description}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            width: '100%',
            maxWidth: layout.stackColumns ? 720 : 'none',
            justifySelf: layout.stackColumns ? 'stretch' : 'auto',
            order: layout.stackColumns ? 1 : 2,
            padding: layout.compactHero ? 18 : 24,
            borderRadius: 28,
            background: 'rgba(7, 14, 26, 0.76)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
            display: 'flex',
            flexDirection: 'column',
            gap: layout.compactHero ? 14 : 18,
          }}
        >
          <div>
            <Badge variant="neutral">STEP 1</Badge>
            <h2 style={{ margin: '10px 0 8px', fontSize: layout.compactHero ? 24 : 28 }}>
              把素材丢进来
            </h2>
            <p style={{ margin: 0, color: '#8ca0bc', lineHeight: 1.7 }}>
              这一步只需要两份基础文件。项目目录会在下一步第一次进入编辑器时选择。
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                viewport.width < 680 ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))',
              gap: 14,
            }}
          >
            <DropCard
              label="AUDIO"
              helper="拖入 MP3 口播音频"
              value={audioPath}
              accentColor="#7bd5ff"
              icon="🎙"
              selectLabel="选择 MP3 文件"
              onPickFile={() => {
                void createSelectHandler('audio')();
              }}
              onDrop={createDropHandler('audio')}
              compact={layout.compactHero}
            />
            <DropCard
              label="SUBTITLE"
              helper="拖入对应 SRT 字幕"
              value={srtPath}
              accentColor="#ffb547"
              icon="📝"
              selectLabel="选择 SRT 文件"
              onPickFile={() => {
                void createSelectHandler('srt')();
              }}
              onDrop={createDropHandler('srt')}
              compact={layout.compactHero}
            />
          </div>

          {errorMessage || localError ? (
            <div
              style={{
                borderRadius: 16,
                background: 'rgba(255,110,110,0.1)',
                border: '1px solid rgba(255,110,110,0.25)',
                color: '#ffb2b2',
                padding: '12px 14px',
                fontSize: 13,
              }}
            >
              {localError || errorMessage}
            </div>
          ) : null}

          <Button
            disabled={!canStart}
            onClick={() => {
              if (audioPath && srtPath) {
                void onComplete(audioPath, srtPath);
              }
            }}
            variant={canStart ? 'tint' : 'secondary'}
            size="lg"
            style={{ marginTop: 'auto', minHeight: 50, borderRadius: 16, fontSize: 16 }}
          >
            {busy ? '正在初始化工程...' : '开始编辑'}
          </Button>
        </div>
      </div>

      <div
        style={{
          padding: `0 clamp(18px, 4vw, 52px) ${layout.compactHero ? 20 : 28}px`,
          color: '#6f829f',
          fontSize: 12,
          letterSpacing: '0.08em',
        }}
      >
        Preview 与导出共享同一份 timeline.json。拖拽失败时，优先从 Finder 直接拖入文件，而不是从浏览器窗口拖入。
      </div>
    </div>
  );
}
