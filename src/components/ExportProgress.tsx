import { Button, ModalShell, ProgressBar } from '../ui/primitives';

interface ExportProgressProps {
  visible: boolean;
  progress: number;
  outputPath: string | null;
  errorMessage: string | null;
  onClose: () => void;
}

export function ExportProgress({
  visible,
  progress,
  outputPath,
  errorMessage,
  onClose,
}: ExportProgressProps) {
  const isDone = progress >= 1 && !errorMessage;
  const canDismiss = isDone || Boolean(errorMessage);

  return (
    <ModalShell
      visible={visible}
      eyebrow="EXPORT"
      title={errorMessage ? '导出失败' : isDone ? '导出完成' : '正在导出视频'}
      zIndex={100}
      size="sm"
      footer={
        <>
          {isDone && outputPath ? (
            <Button
              onClick={() => window.electronAPI.showItemInFolder(outputPath)}
              variant="tint"
            >
              在 Finder 中显示
            </Button>
          ) : null}
          {canDismiss ? (
            <Button onClick={onClose} variant="secondary">
              关闭
            </Button>
          ) : null}
        </>
      }
    >
      <ProgressBar value={progress * 100} tone={errorMessage ? 'danger' : 'info'} />

      <div style={{ marginTop: 14, color: errorMessage ? '#ffb2b2' : '#8da0bb', fontSize: 14 }}>
        {errorMessage || (isDone ? outputPath : `${Math.round(progress * 100)}%`)}
      </div>
    </ModalShell>
  );
}
