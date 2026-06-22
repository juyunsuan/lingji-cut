import { describe, expect, it, vi } from 'vitest';
import {
  buildPublishMetadataUserText,
  generatePublishMetadata,
  parsePublishMetadata,
} from '../src/lib/publish-metadata';
import type { AISettings } from '../src/types/ai';

const FAKE_SETTINGS = {} as AISettings;

describe('parsePublishMetadata', () => {
  it('解析标准结构', () => {
    expect(
      parsePublishMetadata({ title: '标题', desc: '描述', tags: ['a', 'b'] }),
    ).toEqual({ title: '标题', desc: '描述', tags: ['a', 'b'] });
  });

  it('剥离标签的 # 前缀并去重', () => {
    const md = parsePublishMetadata({ title: 't', desc: 'd', tags: ['#科技', '科技', '#AI'] });
    expect(md.tags).toEqual(['科技', 'AI']);
  });

  it('tags 为字符串时按分隔符拆分', () => {
    const md = parsePublishMetadata({ title: 't', desc: 'd', tags: '科技, AI 数码' });
    expect(md.tags).toEqual(['科技', 'AI', '数码']);
  });

  it('兼容 description / keywords 别名', () => {
    const md = parsePublishMetadata({ title: 't', description: 'dd', keywords: ['k'] });
    expect(md.desc).toBe('dd');
    expect(md.tags).toEqual(['k']);
  });

  it('全空时抛错', () => {
    expect(() => parsePublishMetadata({ title: '', desc: '', tags: [] })).toThrow();
  });
});

describe('buildPublishMetadataUserText', () => {
  it('包含节目内容', () => {
    const text = buildPublishMetadataUserText({ sourceText: '内容X' });
    expect(text).toContain('内容X');
  });

  it('有已有标题时一并注入', () => {
    const text = buildPublishMetadataUserText({ sourceText: '内容', currentTitle: '旧标题' });
    expect(text).toContain('旧标题');
    expect(text).toContain('内容');
  });
});

describe('generatePublishMetadata', () => {
  it('调用注入的 generate 并解析结果', async () => {
    const fake = vi.fn().mockResolvedValue({ title: 'T', desc: 'D', tags: ['x'] });
    const md = await generatePublishMetadata(
      FAKE_SETTINGS,
      { sourceText: '节目内容' },
      { generateStructuredData: fake },
    );
    expect(md).toEqual({ title: 'T', desc: 'D', tags: ['x'] });
    expect(fake).toHaveBeenCalledOnce();
  });

  it('sourceText 为空时抛错且不调用 LLM', async () => {
    const fake = vi.fn();
    await expect(
      generatePublishMetadata(FAKE_SETTINGS, { sourceText: '   ' }, { generateStructuredData: fake }),
    ).rejects.toThrow();
    expect(fake).not.toHaveBeenCalled();
  });
});
