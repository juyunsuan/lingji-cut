import type {
  VideoImportProgress,
  VideoImportRequest,
  VideoImportResult,
  VideoImportStatus,
} from '../../src/lib/video-import-types';
import { transcribeWithBcut } from './bcut-asr';
import { douyinDownloader } from './douyin-downloader';
import { extractAudioToMp3 } from './media-extractor';
import {
  buildDouyinImportPaths,
  writePreviewMetadata,
  syncTranscriptToOriginal,
  writeImportResult,
  writeSourceMetadata,
  writeTranscriptMarkdown,
} from './transcript-writer';
import type {
  TranscriptResult,
  VideoImportAsrRunner,
  VideoImportService,
  VideoImportServiceOptions,
  VideoImportTaskSnapshot,
} from './types';

const defaultAsrRunner: VideoImportAsrRunner = {
  transcribe: transcribeWithBcut,
};

class DefaultVideoImportService implements VideoImportService {
  private readonly tasks = new Map<string, VideoImportTaskSnapshot>();

  private readonly downloader;

  private readonly mediaExtractor;

  private readonly asrRunner;

  private readonly now;

  constructor(options: VideoImportServiceOptions = {}) {
    this.downloader = options.downloader ?? douyinDownloader;
    this.mediaExtractor = options.mediaExtractor ?? { extractAudioToMp3 };
    this.asrRunner = options.asrRunner ?? defaultAsrRunner;
    this.now = options.now ?? (() => new Date());
  }

  getImportStatus(importId: string): VideoImportTaskSnapshot | null {
    return this.tasks.get(importId) ?? null;
  }

  startImport(request: VideoImportRequest): VideoImportProgress {
    const importId = this.beginTask(request);
    void this.executeImport(importId, request).catch(() => undefined);
    const snapshot = this.tasks.get(importId);
    if (!snapshot) {
      throw new Error('导入任务初始化失败');
    }
    return snapshot;
  }

  async importVideoSource(request: VideoImportRequest): Promise<VideoImportResult> {
    const importId = this.beginTask(request);
    return this.executeImport(importId, request);
  }

  private beginTask(request: VideoImportRequest): string {
    const importId = `${request.sourceType}_${Date.now()}`;
    const startedAt = this.now().toISOString();
    this.tasks.set(importId, {
      importId,
      sourceType: request.sourceType,
      status: 'downloading',
      progress: 0,
      stepLabel: '准备导入抖音视频',
      request,
      startedAt,
    });
    return importId;
  }

  private updateTask(
    importId: string,
    status: VideoImportStatus,
    progress: number,
    stepLabel: string,
    extras: Partial<VideoImportTaskSnapshot> = {},
  ): void {
    const current = this.tasks.get(importId);
    if (!current) {
      return;
    }

    this.tasks.set(importId, {
      ...current,
      status,
      progress,
      stepLabel,
      ...extras,
    });
  }

  private async executeImport(
    importId: string,
    request: VideoImportRequest,
  ): Promise<VideoImportResult> {
    const startedAt = this.tasks.get(importId)?.startedAt ?? this.now().toISOString();

    try {
      this.updateTask(importId, 'downloading', 5, '正在解析抖音链接');
      const source = await this.downloader.resolveSource(request.url);
      const paths = buildDouyinImportPaths(request.projectDir, source.videoId);

      await writeSourceMetadata(paths, {
        sourceType: 'douyin',
        sourceUrl: request.url,
        importedAt: startedAt,
        ...source,
      });

      this.updateTask(importId, 'downloading', 20, '正在下载抖音视频');
      await this.downloader.downloadToPath(source.downloadUrl, paths.videoPath);

      this.updateTask(importId, 'extracting_audio', 45, '正在提取音频');
      await this.mediaExtractor.extractAudioToMp3(paths.videoPath, paths.audioPath);

      this.updateTask(importId, 'transcribing', 70, '正在进行 bcut 转录');
      const transcript = await this.asrRunner.transcribe(paths.audioPath);
      await writeTranscriptMarkdown(paths, transcript.fullText, transcript.srtText);

      const shouldSync = request.syncToOriginal !== false;
      if (shouldSync) {
        this.updateTask(importId, 'syncing', 90, '正在同步 original.md');
        await syncTranscriptToOriginal(paths);
      }

      const result: VideoImportResult = {
        importId,
        sourceType: 'douyin',
        videoId: source.videoId,
        title: source.title,
        projectDir: request.projectDir,
        importDir: paths.importDir,
        videoPath: paths.videoPath,
        audioPath: paths.audioPath,
        transcriptPath: paths.transcriptPath,
        transcriptSrtPath: paths.transcriptSrtPath,
        originalPath: paths.originalPath,
        sourceMetadataPath: paths.sourceMetadataPath,
        resultMetadataPath: paths.resultMetadataPath,
        previewMetadataPath: paths.previewMetadataPath,
        sourceUrl: request.url,
        resolvedPageUrl: source.resolvedPageUrl,
        coverUrl: source.coverUrl,
        engine: transcript.engine,
        syncedToOriginal: shouldSync,
        createdAt: startedAt,
      };

      await writeImportResult(paths, result);
      await writePreviewMetadata(paths, {
        schema: 'video-import-preview',
        version: 1,
        sourceType: 'douyin',
        title: source.title,
        videoId: source.videoId,
        createdAt: startedAt,
        syncedToOriginal: shouldSync,
        engine: transcript.engine,
        projectDir: request.projectDir,
        importDir: paths.importDir,
        media: {
          videoPath: paths.videoPath,
          audioPath: paths.audioPath,
          coverUrl: source.coverUrl,
        },
        transcript: {
          markdownPath: paths.transcriptPath,
          srtPath: paths.transcriptSrtPath,
          text: transcript.fullText,
          srtText: transcript.srtText,
          segments: transcript.segments,
        },
        metadata: {
          sourceUrl: request.url,
          resolvedPageUrl: source.resolvedPageUrl,
          originalPath: paths.originalPath,
          sourceMetadataPath: paths.sourceMetadataPath,
          resultMetadataPath: paths.resultMetadataPath,
        },
      });
      this.updateTask(importId, 'done', 100, '导入完成', {
        result,
        finishedAt: this.now().toISOString(),
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.updateTask(importId, 'error', 100, '导入失败', {
        error: message,
        finishedAt: this.now().toISOString(),
      });
      throw error;
    }
  }
}

export function createVideoImportService(
  options: VideoImportServiceOptions = {},
): VideoImportService {
  return new DefaultVideoImportService(options);
}

const sharedVideoImportService = createVideoImportService();

export function getVideoImportService(): VideoImportService {
  return sharedVideoImportService;
}
