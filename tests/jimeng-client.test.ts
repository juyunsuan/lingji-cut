import { describe, expect, it } from 'vitest';
import {
  buildJimengImageRequest,
  extractJimengImageUrl,
  extractJimengImageUrls,
} from '../src/lib/jimeng-client';
import type { AISettings } from '../src/types/ai';

const settings: AISettings = {
  llmBaseUrl: '',
  llmApiKey: '',
  llmModel: '',
  jimengApiUrl: 'http://47.109.159.194:8330/',
  jimengSessionId: 'session-test',
};

describe('buildJimengImageRequest', () => {
  it('builds a Jimeng generation request with the expected defaults', () => {
    const request = buildJimengImageRequest('一张科技感播客封面', settings);

    expect(request.url).toBe('http://47.109.159.194:8330/v1/images/generations');
    expect(request.headers.Authorization).toBe('Bearer session-test');
    expect(request.body.model).toBe('jimeng-4.5');
    expect(request.body.ratio).toBe('16:9');
    expect(request.body.n).toBe(4);
  });

  it('uses jimengModel from settings when provided', () => {
    const customSettings: AISettings = { ...settings, jimengModel: 'jimeng-3.0' };
    const request = buildJimengImageRequest('封面', customSettings);
    expect(request.body.model).toBe('jimeng-3.0');
  });

  it('accepts a custom n parameter', () => {
    const request = buildJimengImageRequest('封面', settings, 1);
    expect(request.body.n).toBe(1);
  });
});

describe('extractJimengImageUrls', () => {
  it('returns all image urls from the api response', () => {
    expect(
      extractJimengImageUrls({
        data: [
          { url: 'https://example.com/cover1.png' },
          { url: 'https://example.com/cover2.png' },
          { url: 'https://example.com/cover3.png' },
          { url: 'https://example.com/cover4.png' },
        ],
      }),
    ).toEqual([
      'https://example.com/cover1.png',
      'https://example.com/cover2.png',
      'https://example.com/cover3.png',
      'https://example.com/cover4.png',
    ]);
  });

  it('filters out null and empty urls', () => {
    expect(
      extractJimengImageUrls({
        data: [{ url: 'https://example.com/cover.png' }, { url: null }, null],
      }),
    ).toEqual(['https://example.com/cover.png']);
  });

  it('returns empty array for empty data', () => {
    expect(extractJimengImageUrls({ data: [] })).toEqual([]);
  });
});

describe('extractJimengImageUrl', () => {
  it('returns the first image url from the api response', () => {
    expect(
      extractJimengImageUrl({
        data: [{ url: 'https://example.com/cover.png' }],
      }),
    ).toBe('https://example.com/cover.png');
  });

  it('returns null for malformed api payloads', () => {
    expect(extractJimengImageUrl({ data: [] })).toBeNull();
  });
});
