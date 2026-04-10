/**
 * 口播稿工作台共用工具函数
 * 从旧 Step 组件中提取，供 ScriptWorkbench 及后续 Agent 流程复用。
 */

import { generateText, streamText, parseLLMJsonResponse } from './llm';
import { getAnyTemplateById } from './script-templates';
import { reviewScript, REVIEW_SYSTEM_PROMPT, parseAnnotations } from './script-review';
import { loadAISettings } from '../store/ai';
import { loadReviewCriteria } from './settings-storage';
import { getRoleById } from './script-templates';
import type { Annotation } from '../store/script';

// --- 原稿统计 ---

export interface OriginalStats {
  charCount: number;
  paragraphs: number;
  readMinutes: number;
}

export function getOriginalStats(text: string): OriginalStats {
  const charCount = text.length;
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
  const readMinutes = Math.max(1, Math.ceil(charCount / 400));
  return { charCount, paragraphs, readMinutes };
}

// --- 生成稿统计 ---

export interface GeneratedScriptStats {
  charCount: number;
  readMinutes: number;
}

export function getGeneratedScriptStats(text: string): GeneratedScriptStats {
  return {
    charCount: text.length,
    readMinutes: Math.max(1, Math.ceil(text.length / 300)),
  };
}

// --- 批注摘要 ---

export interface AnnotationSummary {
  total: number;
  pending: number;
  accepted: number;
  dismissed: number;
}

export function getAnnotationSummary(annotations: Annotation[]): AnnotationSummary {
  return annotations.reduce<AnnotationSummary>(
    (summary, annotation) => {
      summary.total += 1;
      summary[annotation.status] += 1;
      return summary;
    },
    { total: 0, pending: 0, accepted: 0, dismissed: 0 },
  );
}

// --- 最终稿摘要 ---

export interface FinalScriptSummary {
  charCount: number;
  paragraphCount: number;
}

export function getFinalScriptSummary(text: string): FinalScriptSummary {
  return {
    charCount: text.length,
    paragraphCount: text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length,
  };
}

// --- AI 生成 ---

export async function generateScriptDraft(
  originalText: string,
  templateId: string,
  roleId?: string,
): Promise<string> {
  const template = getAnyTemplateById(templateId);
  if (!template) {
    throw new Error('未找到选中的写稿模板');
  }

  const settings = await loadAISettings();
  if (!settings?.llmApiKey) {
    throw new Error('请先在 AI 设置中配置 LLM API Key');
  }

  // 如果选择了角色，将角色指令注入到 systemPrompt 前面
  let systemPrompt = template.systemPrompt;
  if (roleId && roleId !== 'none') {
    const role = getRoleById(roleId);
    if (role?.rolePrompt) {
      systemPrompt = `【角色设定】\n${role.rolePrompt}\n\n【写作要求】\n${systemPrompt}`;
    }
  }

  return generateText(settings, systemPrompt, originalText);
}

/**
 * 流式生成口播稿草稿，逐 token 回调
 * @param onChunk 每收到一个 token 片段时调用
 * @returns 完整生成文本
 */
export async function generateScriptDraftStream(
  originalText: string,
  templateId: string,
  roleId: string | undefined,
  onChunk: (chunk: string) => void,
  options?: {
    onReasoningChunk?: (chunk: string) => void;
  },
): Promise<string> {
  const template = getAnyTemplateById(templateId);
  if (!template) {
    throw new Error('未找到选中的写稿模板');
  }

  const settings = await loadAISettings();
  if (!settings?.llmApiKey) {
    throw new Error('请先在 AI 设置中配置 LLM API Key');
  }

  let systemPrompt = template.systemPrompt;
  if (roleId && roleId !== 'none') {
    const role = getRoleById(roleId);
    if (role?.rolePrompt) {
      systemPrompt = `【角色设定】\n${role.rolePrompt}\n\n【写作要求】\n${systemPrompt}`;
    }
  }

  return streamText(settings, systemPrompt, originalText, onChunk, options);
}

// --- AI 审查 ---

export async function runScriptReview(scriptText: string): Promise<Annotation[]> {
  const settings = await loadAISettings();
  if (!settings?.llmApiKey) {
    throw new Error('请先在 AI 设置中配置 LLM API Key');
  }

  return reviewScript(settings, scriptText);
}

/**
 * 流式审稿：逐 token 回调（用于驱动审稿动画），最终解析并返回批注列表
 */
export async function runScriptReviewStream(
  scriptText: string,
  onChunk: (chunk: string) => void,
  options?: {
    onReasoningChunk?: (chunk: string) => void;
  },
): Promise<Annotation[]> {
  const settings = await loadAISettings();
  if (!settings?.llmApiKey) {
    throw new Error('请先在 AI 设置中配置 LLM API Key');
  }

  const userCriteria = loadReviewCriteria();
  const systemPrompt = userCriteria.trim()
    ? `${REVIEW_SYSTEM_PROMPT}\n\n用户补充的审查要求：\n${userCriteria}`
    : REVIEW_SYSTEM_PROMPT;

  // 流式调用 LLM，缓冲完整 JSON 响应
  const fullText = await streamText(settings, systemPrompt, scriptText, onChunk, options);

  // 从流式文本中提取 JSON 并解析批注
  const payload = parseLLMJsonResponse(fullText);
  return parseAnnotations(payload, scriptText);
}
