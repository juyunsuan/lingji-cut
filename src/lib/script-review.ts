// src/lib/script-review.ts
import type { AISettings } from '../types/ai';
import { generateStructuredData } from './llm';
import type { Annotation, AnnotationSeverity } from '../store/script';
import { loadReviewCriteria } from './settings-storage';

export const REVIEW_SYSTEM_PROMPT = `你是一位专业的口播稿审查编辑。请审查用户提供的口播稿，从以下维度给出批注：

1. **事实准确性**（severity: error）：数据是否有来源、表述是否可能有误
2. **表达流畅性**（severity: warning）：是否有书面化表达、长句、不适合口播的措辞
3. **逻辑连贯性**（severity: warning）：段落过渡是否自然、论述是否有跳跃
4. **口语化程度**（severity: info）：可以更口语化的表达建议

请以 JSON 格式返回审查结果：
{
  "annotations": [
    {
      "originalText": "需要标注的原文片段（必须是稿件中的精确子串）",
      "issue": "问题描述",
      "suggestion": "修改建议（替换后的完整文本）",
      "severity": "error | warning | info"
    }
  ]
}

规则：
- 每条批注的 originalText 必须是稿件中能精确匹配的子串
- 批注数量控制在 3~8 条，聚焦最重要的问题
- suggestion 必须是可以直接替换 originalText 的完整文本
- 不要对标题格式（# ## 等）做批注`;

interface RawAnnotation {
  originalText?: string;
  issue?: string;
  suggestion?: string;
  severity?: string;
}

function isValidSeverity(value: unknown): value is AnnotationSeverity {
  return value === 'error' || value === 'warning' || value === 'info';
}

export function parseAnnotations(payload: unknown, scriptText: string): Annotation[] {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { annotations?: unknown[] }).annotations)) {
    return [];
  }

  const annotations: Annotation[] = [];
  let counter = 0;

  for (const raw of (payload as { annotations: RawAnnotation[] }).annotations) {
    if (!raw.originalText || !raw.issue || !raw.suggestion) continue;
    if (!isValidSeverity(raw.severity)) continue;

    const startOffset = scriptText.indexOf(raw.originalText);
    if (startOffset === -1) continue;

    counter += 1;
    annotations.push({
      id: `ann-${counter}`,
      startOffset,
      endOffset: startOffset + raw.originalText.length,
      originalText: raw.originalText,
      quotedText: raw.originalText,
      docVersion: 0,
      issue: raw.issue,
      suggestion: raw.suggestion,
      severity: raw.severity,
      status: 'pending',
    });
  }

  return annotations;
}

export async function reviewScript(
  settings: AISettings,
  scriptText: string,
): Promise<Annotation[]> {
  const userCriteria = loadReviewCriteria();
  const fullPrompt = userCriteria.trim()
    ? `${REVIEW_SYSTEM_PROMPT}\n\n用户补充的审查要求：\n${userCriteria}`
    : REVIEW_SYSTEM_PROMPT;

  const payload = await generateStructuredData(settings, fullPrompt, scriptText);
  return parseAnnotations(payload, scriptText);
}
