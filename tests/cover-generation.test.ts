import { describe, expect, it, vi } from 'vitest';
import type { ImageProvider } from '../src/types/ai';

vi.mock('../src/lib/jimeng-client', () => ({
  generateImage: vi.fn(async () => 'http://x/y.png'),
}));

import { generateCoverImage } from '../src/lib/cover-generation';

describe('generateCoverImage dispatcher', () => {
  it('jimeng 类型走 jimeng-client', async () => {
    const provider: ImageProvider = {
      id: 'i',
      name: 'j',
      type: 'jimeng',
      baseUrl: 'u',
      apiKey: 'k',
      models: ['m'],
    };
    const url = await generateCoverImage('prompt', provider, 'm');
    expect(url).toBe('http://x/y.png');
  });

  it('openai_image 暂未实现：抛错', async () => {
    const provider: ImageProvider = {
      id: 'i',
      name: 'd',
      type: 'openai_image',
      baseUrl: 'u',
      apiKey: 'k',
      models: ['m'],
    };
    await expect(generateCoverImage('p', provider, 'm')).rejects.toThrow(/未实现/);
  });

  it('custom 暂未实现：抛错', async () => {
    const provider: ImageProvider = {
      id: 'i',
      name: 'c',
      type: 'custom',
      baseUrl: 'u',
      apiKey: 'k',
      models: ['m'],
    };
    await expect(generateCoverImage('p', provider, 'm')).rejects.toThrow(/未实现/);
  });
});
