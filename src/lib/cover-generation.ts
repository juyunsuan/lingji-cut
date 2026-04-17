import type { ImageProvider } from '../types/ai';
import { generateImage as jimengGenerateImage } from './jimeng-client';

/**
 * 按 ImageProvider.type 分派到具体的文生图实现。
 * 当前仅实现 jimeng；openai_image / custom 预留接口，后续切片补齐。
 */
export async function generateCoverImage(
  prompt: string,
  provider: ImageProvider,
  model: string,
): Promise<string> {
  switch (provider.type) {
    case 'jimeng':
      return jimengGenerateImage(prompt, provider, model);
    case 'openai_image':
    case 'custom':
      throw new Error(`ImageProvider.type=${provider.type} 暂未实现`);
    default: {
      const _exhaustive: never = provider.type;
      throw new Error(`未知 ImageProvider.type=${String(_exhaustive)}`);
    }
  }
}
