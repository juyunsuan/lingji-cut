export type PublishPlatform = 'douyin' | 'tencent' | 'xiaohongshu' | 'kuaishou' | 'bilibili';

export interface PublishAccount {
  id: string;
  platform: PublishPlatform;
  accountName: string;
  storageStatePath: string;
  status: 'valid' | 'expired' | 'unknown';
  lastCheckedAt?: number;
}

export interface PublishTarget {
  accountId: string;
  overrides?: { title?: string; desc?: string; tags?: string[] };
  bilibili?: { tid: number };
}

export interface PublishShared {
  title: string;
  desc: string;
  tags: string[];
  thumbnail?: string;
  scheduleAt?: number;
}

export interface PublishResult {
  state: 'pending' | 'running' | 'success' | 'failed';
  percent?: number;
  message?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface PublishJob {
  id: string;
  filePath: string;
  shared: PublishShared;
  targets: PublishTarget[];
  results: Record<string, PublishResult>;
}

// 单平台上传入参（engine → platform 模块）
export interface UploadVideoOptions {
  storageStatePath: string;
  filePath: string;
  title: string;
  desc: string;
  tags: string[];
  thumbnail?: string;
  scheduleAt?: number;
  headless: boolean;
  tid?: number;               // B 站专属：分区 id（runner 从 target.bilibili.tid 透传）
  onProgress?: (percent: number, message?: string) => void;
}

export interface LoginOptions {
  storageStatePath: string;
  onQrcode?: (pngPath: string) => void;
}

export interface PlatformModule {
  platform: PublishPlatform;
  login(opts: LoginOptions): Promise<{ success: boolean; message: string }>;
  checkCookie(storageStatePath: string): Promise<boolean>;
  uploadVideo(opts: UploadVideoOptions): Promise<void>;
}
