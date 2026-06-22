// 发布文案（标题 / 描述 / 标签）的 AI 一键生成。
// 在主进程内通过 generateStructuredData 调用默认 LLM（与封面提示词重生成同源）。

import type { AISettings } from '../types/ai';
import { generateStructuredData } from './llm';

export interface PublishMetadataInput {
  /** 节目内容素材：摘要 / 关键词 / 字幕摘录拼接而成。 */
  sourceText: string;
  /** 当前已填标题，作为风格参考（可空）。 */
  currentTitle?: string;
}

export interface PublishMetadata {
  title: string;
  desc: string;
  tags: string[];
}

const SYSTEM_PROMPT = `你是一名短视频 / 中视频平台的运营文案专家，服务于抖音、视频号、小红书、快手、B站等平台。
请根据提供的节目内容，产出一套可直接发布的文案，目标是高完播与高点击。

要求：
- title：一条有点击欲的标题，12-24 个汉字，可用悬念 / 数字 / 反差 / 痛点，但不要标题党到偏离内容；不要书名号、不要表情符号。
- desc：一段简介，60-150 字，自然口语、信息密度高，结尾可引导互动（点赞 / 关注 / 评论）；可包含 1-3 个话题词（以 # 开头），但话题词请放在 desc 末尾。
- tags：3-8 个关键词标签，输出纯文本，不要带 # 前缀、不要标点；覆盖主题、领域、人群、热点。
- 全部使用简体中文（专有名词、品牌名除外）。

只返回严格 JSON，不要附加任何解释，结构如下：
{ "title": "字符串", "desc": "字符串", "tags": ["标签1", "标签2"] }`;

export function buildPublishMetadataUserText(input: PublishMetadataInput): string {
  const parts: string[] = [];
  if (input.currentTitle?.trim()) {
    parts.push(`【已有标题，可参考其风格】\n${input.currentTitle.trim()}`);
  }
  parts.push(`【节目内容】\n${input.sourceText.trim()}`);
  return parts.join('\n\n');
}

function coerceString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function coerceTags(value: unknown): string[] {
  const raw: unknown[] = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,，、\s]+/)
      : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const cleaned = item.trim().replace(/^#+/, '').trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    tags.push(cleaned);
  }
  return tags.slice(0, 12);
}

export function parsePublishMetadata(payload: Record<string, unknown>): PublishMetadata {
  const title = coerceString(payload.title);
  const desc = coerceString(payload.desc ?? payload.description);
  const tags = coerceTags(payload.tags ?? payload.keywords);
  if (!title && !desc && tags.length === 0) {
    throw new Error('LLM 未返回有效的发布文案');
  }
  return { title, desc, tags };
}

export interface GeneratePublishMetadataOptions {
  /** 注入点：默认使用 generateStructuredData，测试可替换。 */
  generateStructuredData?: typeof generateStructuredData;
}

export async function generatePublishMetadata(
  settings: AISettings,
  input: PublishMetadataInput,
  options: GeneratePublishMetadataOptions = {},
): Promise<PublishMetadata> {
  if (!input.sourceText.trim()) {
    throw new Error('没有可用于生成文案的节目内容');
  }
  const generate = options.generateStructuredData ?? generateStructuredData;
  const payload = await generate(
    settings,
    SYSTEM_PROMPT,
    buildPublishMetadataUserText(input),
    undefined,
    { label: 'publish-metadata' },
  );
  return parsePublishMetadata(payload);
}
