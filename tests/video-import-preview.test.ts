import { describe, expect, it } from 'vitest';
import {
  isVideoImportPreviewDocument,
  isVideoImportPreviewFile,
  parseVideoImportPreviewDocument,
} from '../src/lib/video-import-preview';

const previewJson = JSON.stringify({
  schema: 'video-import-preview',
  version: 1,
  sourceType: 'douyin',
  title: '测试标题',
  videoId: '123',
  createdAt: '2026-04-10T00:00:00.000Z',
  syncedToOriginal: true,
  engine: 'bcut',
  projectDir: '/tmp/demo',
  importDir: '/tmp/demo/imports/douyin/123',
  media: {
    videoPath: '/tmp/demo/imports/douyin/123/video.mp4',
    audioPath: '/tmp/demo/imports/douyin/123/audio.mp3',
  },
  transcript: {
    markdownPath: '/tmp/demo/imports/douyin/123/transcript.md',
    srtPath: '/tmp/demo/imports/douyin/123/transcript.srt',
    text: '第一段\n\n第二段',
    srtText: '1\n00:00:00,000 --> 00:00:01,000\n第一段\n',
    segments: [{ text: '第一段', startMs: 0, endMs: 1000 }],
  },
  metadata: {
    sourceUrl: 'https://v.douyin.com/demo',
    resolvedPageUrl: 'https://www.douyin.com/video/123',
    originalPath: '/tmp/demo/original.md',
    sourceMetadataPath: '/tmp/demo/imports/douyin/123/source.json',
    resultMetadataPath: '/tmp/demo/imports/douyin/123/import-result.json',
  },
});

describe('video import preview helpers', () => {
  it('matches the standard preview json file path', () => {
    expect(isVideoImportPreviewFile('imports/douyin/123/preview.json')).toBe(true);
    expect(isVideoImportPreviewFile('imports/douyin/123/source.json')).toBe(false);
  });

  it('parses a valid preview document', () => {
    const parsed = parseVideoImportPreviewDocument(previewJson);

    expect(parsed?.schema).toBe('video-import-preview');
    expect(parsed?.media.videoPath).toContain('video.mp4');
  });

  it('rejects invalid preview content', () => {
    expect(isVideoImportPreviewDocument({ schema: 'other' })).toBe(false);
    expect(parseVideoImportPreviewDocument('{"schema":"other"}')).toBeNull();
  });
});
