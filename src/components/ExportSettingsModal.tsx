import { useEffect, useMemo, useState } from 'react';
import {
  buildExportRenderConfig,
  EXPORT_QUALITY_OPTIONS,
  EXPORT_RESOLUTION_OPTIONS,
  type ExportConfig,
  type ExportQuality,
  type ExportResolution,
} from '../lib/export-settings';
import { Badge, Button, ModalShell } from '../ui/primitives';

interface ExportSettingsModalProps {
  visible: boolean;
  timelineWidth: number;
  timelineHeight: number;
  onClose: () => void;
  onConfirm: (payload: { outputPath: string; exportConfig: ExportConfig }) => Promise<void> | void;
}

export function ExportSettingsModal({
  visible,
  timelineWidth,
  timelineHeight,
  onClose,
  onConfirm,
}: ExportSettingsModalProps) {
  const [resolution, setResolution] = useState<ExportResolution>('720p');
  const [quality, setQuality] = useState<ExportQuality>('balanced');
  const [outputPath, setOutputPath] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setResolution('720p');
    setQuality('balanced');
    setOutputPath('');
    setIsSubmitting(false);
  }, [visible]);

  const renderConfig = useMemo(
    () =>
      buildExportRenderConfig({
        timelineWidth,
        timelineHeight,
        resolution,
        quality,
      }),
    [quality, resolution, timelineHeight, timelineWidth],
  );

  const handleSelectOutputPath = async () => {
    const savePath = await window.electronAPI.selectOutputPath();
    if (!savePath) {
      return;
    }

    setOutputPath(savePath);
  };

  const handleConfirm = async () => {
    if (!outputPath || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      await onConfirm({
        outputPath,
        exportConfig: {
          resolution,
          quality,
        },
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell
      visible={visible}
      eyebrow="EXPORT"
      title="导出设置"
      description="首轮导出建议先选择较低分辨率和更快档位，快速检查节奏、字幕和画面排布。"
      zIndex={110}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              void handleConfirm();
            }}
            disabled={!outputPath || isSubmitting}
            loading={isSubmitting}
          >
            {isSubmitting ? '准备中...' : '开始导出'}
          </Button>
        </>
      }
    >
      <div
        style={{
          padding: 16,
          borderRadius: 18,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ fontSize: 12, letterSpacing: '0.12em', color: '#91a2bc' }}>输出路径</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <div
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              color: outputPath ? '#f5f7fb' : '#70839f',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {outputPath || '还未选择导出位置'}
          </div>
          <Button onClick={() => void handleSelectOutputPath()} variant="secondary">
            选择位置
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 18 }}>
        <div>
          <div style={sectionTitleStyle}>分辨率</div>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            {EXPORT_RESOLUTION_OPTIONS.map((option) => {
              const dimensions = buildExportRenderConfig({
                timelineWidth,
                timelineHeight,
                resolution: option.value,
                quality,
              });
              const isActive = resolution === option.value;

              return (
                <button
                  key={option.value}
                  onClick={() => setResolution(option.value)}
                  style={{
                    ...optionButtonStyle,
                    borderColor: isActive ? 'rgba(123,213,255,0.4)' : 'rgba(255,255,255,0.08)',
                    background: isActive ? 'rgba(123,213,255,0.12)' : 'rgba(255,255,255,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ color: '#f5f7fb', fontWeight: 700 }}>{option.label}</span>
                    <span style={{ color: '#7bd5ff', fontSize: 12 }}>
                      {dimensions.renderWidth} × {dimensions.renderHeight}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, color: '#8da0bb', fontSize: 12, lineHeight: 1.6 }}>
                    {option.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div style={sectionTitleStyle}>导出速度</div>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            {EXPORT_QUALITY_OPTIONS.map((option) => {
              const isActive = quality === option.value;

              return (
                <button
                  key={option.value}
                  onClick={() => setQuality(option.value)}
                  style={{
                    ...optionButtonStyle,
                    borderColor: isActive ? 'rgba(255,181,71,0.4)' : 'rgba(255,255,255,0.08)',
                    background: isActive ? 'rgba(255,181,71,0.1)' : 'rgba(255,255,255,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ color: '#f5f7fb', fontWeight: 700 }}>{option.label}</span>
                    <span style={{ color: '#ffb547', fontSize: 12 }}>
                      {
                        buildExportRenderConfig({
                          timelineWidth,
                          timelineHeight,
                          resolution,
                          quality: option.value,
                        }).videoBitrate
                      }
                    </span>
                  </div>
                  <div style={{ marginTop: 6, color: '#8da0bb', fontSize: 12, lineHeight: 1.6 }}>
                    {option.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          padding: 16,
          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        <div style={sectionTitleStyle}>本次导出摘要</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          <Badge variant="neutral">{renderConfig.renderWidth} × {renderConfig.renderHeight}</Badge>
          <Badge variant="neutral">{renderConfig.videoBitrate}</Badge>
          <Badge variant="neutral">{renderConfig.audioBitrate}</Badge>
          <Badge variant="neutral">{renderConfig.x264Preset}</Badge>
        </div>
      </div>
    </ModalShell>
  );
}

const sectionTitleStyle = {
  fontSize: 12,
  letterSpacing: '0.12em',
  color: '#91a2bc',
} as const;

const optionButtonStyle = {
  width: '100%',
  textAlign: 'left' as const,
  padding: 14,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.03)',
  cursor: 'pointer',
} as const;
