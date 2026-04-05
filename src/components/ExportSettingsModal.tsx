import { useEffect, useMemo, useState } from "react";
import {
  buildExportRenderConfig,
  EXPORT_QUALITY_OPTIONS,
  EXPORT_RESOLUTION_OPTIONS,
  type ExportConfig,
  type ExportQuality,
  type ExportResolution,
} from "../lib/export-settings";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Eyebrow,
  Field,
  ModalFooter,
  Select,
} from "../ui";
import styles from "./ExportSettingsModal.module.css";

interface ExportSettingsModalProps {
  visible: boolean;
  timelineWidth: number;
  timelineHeight: number;
  onClose: () => void;
  onConfirm: (payload: {
    outputPath: string;
    exportConfig: ExportConfig;
  }) => Promise<void> | void;
}

export function ExportSettingsModal({
  visible,
  timelineWidth,
  timelineHeight,
  onClose,
  onConfirm,
}: ExportSettingsModalProps) {
  const [resolution, setResolution] = useState<ExportResolution>("720p");
  const [quality, setQuality] = useState<ExportQuality>("balanced");
  const [outputPath, setOutputPath] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setResolution("720p");
    setQuality("balanced");
    setOutputPath("");
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
    <Dialog open={visible} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <Eyebrow>EXPORT</Eyebrow>
          <DialogTitle>导出设置</DialogTitle>
          <DialogDescription>
            首轮导出建议先选择较低分辨率和更快档位，快速检查节奏、字幕和画面排布。
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card className={`${styles.pathCard} p-4`}>
            <div className={styles.sectionLabel}>输出路径</div>
            <div className={styles.pathRow}>
              <div
                className={[
                  styles.pathValue,
                  outputPath ? styles.pathValueFilled : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {outputPath || "还未选择导出位置"}
              </div>
              <Button
                onClick={() => void handleSelectOutputPath()}
                variant="secondary"
              >
                选择位置
              </Button>
            </div>
          </Card>

          <div className={styles.grid}>
            <div className={styles.column}>
              <Field label="分辨率">
                <Select
                  value={resolution}
                  options={EXPORT_RESOLUTION_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  onChange={(event) => setResolution(event.target.value as ExportResolution)}
                />
              </Field>
              <Card className={`${styles.summaryCard} p-4`}>
                <div className={styles.sectionLabel}>当前分辨率说明</div>
                <div className={styles.column}>
                  <div>{EXPORT_RESOLUTION_OPTIONS.find((option) => option.value === resolution)?.description}</div>
                  <div>
                    {renderConfig.renderWidth} × {renderConfig.renderHeight}
                  </div>
                </div>
              </Card>
            </div>

            <div className={styles.column}>
              <Field label="导出速度">
                <Select
                  value={quality}
                  options={EXPORT_QUALITY_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  onChange={(event) => setQuality(event.target.value as ExportQuality)}
                />
              </Field>
              <Card className={`${styles.summaryCard} p-4`}>
                <div className={styles.sectionLabel}>当前导出速度说明</div>
                <div className={styles.column}>
                  <div>{EXPORT_QUALITY_OPTIONS.find((option) => option.value === quality)?.description}</div>
                  <div>{renderConfig.videoBitrate}</div>
                </div>
              </Card>
            </div>
          </div>

          <Card className={`${styles.summaryCard} p-4`}>
            <div className={styles.sectionLabel}>本次导出摘要</div>
            <div className={styles.summary}>
              <Badge variant="secondary">
                {renderConfig.renderWidth} × {renderConfig.renderHeight}
              </Badge>
              <Badge variant="secondary">{renderConfig.videoBitrate}</Badge>
              <Badge variant="secondary">{renderConfig.audioBitrate}</Badge>
              <Badge variant="secondary">{renderConfig.x264Preset}</Badge>
            </div>
          </Card>
        </DialogBody>
        <DialogFooter>
          <ModalFooter
            onCancel={onClose}
            onConfirm={() => {
              void handleConfirm();
            }}
            confirmLabel={isSubmitting ? "准备中..." : "开始导出"}
            confirmDisabled={!outputPath || isSubmitting}
            confirmLoading={isSubmitting}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

