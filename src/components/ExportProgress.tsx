import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ModalFooter,
  Progress,
} from "../ui";
import styles from "./ExportProgress.module.css";

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
    <Dialog open={visible} onOpenChange={(open) => !open && canDismiss && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <div className={styles.eyebrow}>EXPORT</div>
          <DialogTitle>{errorMessage ? "导出失败" : isDone ? "导出完成" : "正在导出视频"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Progress value={progress * 100} variant={errorMessage ? "danger" : "default"} />

          <div
            className={[styles.status, errorMessage ? styles.statusError : ""]
              .filter(Boolean)
              .join(" ")}
          >
            {errorMessage || (isDone ? outputPath : `${Math.round(progress * 100)}%`)}
          </div>
        </DialogBody>
        <DialogFooter>
          <ModalFooter
            extra={
              isDone && outputPath ? (
                <Button
                  onClick={() => window.electronAPI.showItemInFolder(outputPath)}
                  variant="accent"
                >
                  在 Finder 中显示
                </Button>
              ) : null
            }
            onCancel={canDismiss ? onClose : undefined}
            cancelLabel="关闭"
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
