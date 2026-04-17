import { v4 as uuid } from 'uuid';
import { DEFAULT_JIMENG_MODEL, type CoverCandidate, type ImageProvider } from '../types/ai';

interface JimengApiResponse {
  data?: Array<{ url?: string | null } | null> | null;
}

export interface JimengImageRequest {
  url: string;
  headers: Record<string, string>;
  body: {
    model: string;
    prompt: string;
    ratio: string;
    resolution: string;
    n?: number;
  };
}

export function buildJimengImageRequest(
  prompt: string,
  provider: ImageProvider,
  model: string,
  n = 4,
): JimengImageRequest {
  return {
    url: `${provider.baseUrl.replace(/\/+$/, '')}/v1/images/generations`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: {
      model: model?.trim() || DEFAULT_JIMENG_MODEL,
      prompt,
      ratio: '16:9',
      resolution: '2k',
      n,
    },
  };
}

export function extractJimengImageUrls(payload: JimengApiResponse): string[] {
  return (payload.data ?? [])
    .map((item) => item?.url)
    .filter((url): url is string => typeof url === 'string' && url.length > 0);
}

export function extractJimengImageUrl(payload: JimengApiResponse): string | null {
  return extractJimengImageUrls(payload)[0] ?? null;
}

export async function generateImage(
  prompt: string,
  provider: ImageProvider,
  model: string,
): Promise<string> {
  const request = buildJimengImageRequest(prompt, provider, model);
  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`即梦 API 错误 ${response.status}: ${errorText}`);
  }

  const imageUrl = extractJimengImageUrl((await response.json()) as JimengApiResponse);
  if (!imageUrl) {
    throw new Error('即梦 API 未返回图片 URL');
  }

  return imageUrl;
}

export async function downloadImage(imageUrl: string, outputPath: string): Promise<void> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`下载图片失败: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buffer);
}

export async function generateCoverCandidates(
  prompts: string[],
  provider: ImageProvider,
  model: string,
  coversDir: string,
): Promise<CoverCandidate[]> {
  const path = await import('node:path');
  const candidates: CoverCandidate[] = [];

  for (const prompt of prompts) {
    const request = buildJimengImageRequest(prompt, provider, model, 4);
    try {
      const response = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`即梦 API 错误 ${response.status}: ${errorText}`);
      }

      const imageUrls = extractJimengImageUrls((await response.json()) as JimengApiResponse);

      if (imageUrls.length === 0) {
        throw new Error('即梦 API 未返回图片 URL');
      }

      for (const imageUrl of imageUrls) {
        const id = uuid();
        const outputPath = path.join(coversDir, `cover-${id}.png`);
        try {
          await downloadImage(imageUrl, outputPath);
          candidates.push({ id, prompt, imageUrl: outputPath, selected: false });
        } catch (dlError) {
          candidates.push({
            id,
            prompt,
            imageUrl: '',
            selected: false,
            error: dlError instanceof Error ? dlError.message : '下载封面失败',
          });
        }
      }
    } catch (error) {
      candidates.push({
        id: uuid(),
        prompt,
        imageUrl: '',
        selected: false,
        error: error instanceof Error ? error.message : '封面生成失败',
      });
    }
  }

  // 第一个成功下载的候选设为默认选中
  const firstSuccess = candidates.find((c) => c.imageUrl);
  if (firstSuccess) {
    firstSuccess.selected = true;
  }

  return candidates;
}
