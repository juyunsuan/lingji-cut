export function msToFrame(ms: number, fps: number): number {
  return Math.floor((ms / 1000) * fps);
}

export function frameToMs(frame: number, fps: number): number {
  return Math.round((frame / fps) * 1000);
}

export function formatTime(ms: number): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function getFileNameFromPath(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return normalizedPath.split('/').pop() || filePath;
}

export function toFileSrc(filePath: string): string {
  if (!filePath) {
    return '';
  }

  if (
    filePath.startsWith('file://') ||
    filePath.startsWith('http://') ||
    filePath.startsWith('https://')
  ) {
    return filePath;
  }

  const normalizedPath = filePath.replace(/\\/g, '/');
  // encodeURI 不编码 # 和 ?，但它们在 URL 中有特殊含义，会导致 file:// 路径解析错误
  return `file://${encodeURI(normalizedPath).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
