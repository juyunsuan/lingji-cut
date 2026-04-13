import {
  buildDefaultStoryboardPlan,
  type AISegmentAnalysis,
  type AIStoryboardPlan,
  type AIVisualSuggestion,
  type AIVisualSuggestionType,
} from '../types/ai';

function createSuggestion(
  segment: AISegmentAnalysis,
  suggestionType: AIVisualSuggestionType,
  templateKey: string,
  reason: string,
): AIVisualSuggestion {
  return {
    id: `visual-${segment.id}`,
    segmentId: segment.id,
    suggestionType,
    priority: Math.max(1, Math.round(segment.visualizationScore)),
    reason,
    enabled: true,
    startMs: segment.startMs,
    endMs: segment.endMs,
    displayDurationMs: Math.max(1_200, segment.endMs - segment.startMs),
    displayMode: suggestionType === 'content-card' ? 'pip' : 'fullscreen',
    templateKey,
    visualBrief: `${segment.title}：${segment.summary}`,
    autoApplyEligible: segment.visualizationScore >= 60,
  };
}

function chooseSuggestionType(
  segment: AISegmentAnalysis,
): Pick<AIVisualSuggestion, 'suggestionType' | 'templateKey' | 'reason'> {
  if (segment.semanticType === 'chapter-transition' || segment.pacingNeed === 'transition') {
    return {
      suggestionType: 'chapter-transition',
      templateKey: 'chapter-stinger',
      reason: '这段存在明显的话题切换信号，适合用章节切场重置观看节奏。',
    };
  }

  if (segment.semanticType === 'data' && segment.visualizationScore >= 75) {
    return {
      suggestionType: 'data-motion',
      templateKey: segment.entities.length > 1 ? 'bar-chart-reveal' : 'kpi-countup',
      reason: '这段包含高价值数据表达，适合用数据动画提升理解和记忆点。',
    };
  }

  if (
    segment.semanticType === 'explanation' &&
    segment.complexityLevel !== 'low' &&
    segment.visualizationScore >= 65
  ) {
    return {
      suggestionType: 'explainer-motion',
      templateKey: 'step-flow-explainer',
      reason: '这段解释复杂度较高，适合用流程化动画降低理解门槛。',
    };
  }

  return {
    suggestionType: 'content-card',
    templateKey: segment.semanticType === 'quote' ? 'quote-default' : 'summary-default',
    reason: '这段更适合用信息卡片稳定承载重点，而不是强行做复杂动画。',
  };
}

export function buildStoryboardSuggestions(
  segments: AISegmentAnalysis[],
  options: {
    summary?: string;
    globalPrompt?: string;
    generatedAt?: number;
  } = {},
): AIStoryboardPlan {
  const plan = buildDefaultStoryboardPlan();

  plan.segments = segments;
  plan.summary = options.summary ?? '';
  plan.globalPrompt = options.globalPrompt;
  plan.generatedAt = options.generatedAt ?? Date.now();
  plan.suggestions = segments
    .map((segment) => {
      const next = chooseSuggestionType(segment);
      return createSuggestion(segment, next.suggestionType, next.templateKey, next.reason);
    })
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      if (left.startMs !== right.startMs) {
        return left.startMs - right.startMs;
      }
      return left.id.localeCompare(right.id);
    });

  return plan;
}
