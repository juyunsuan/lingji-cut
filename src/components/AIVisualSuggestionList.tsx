import { Badge, Checkbox } from '../ui';
import type { AIStoryboardPlan } from '../types/ai';
import styles from './AIVisualSuggestionList.module.css';

interface AIVisualSuggestionListProps {
  storyboardPlan: AIStoryboardPlan | null;
  autoApplyEnabled: boolean;
  onToggleAutoApply?: (enabled: boolean) => void;
}

function getSuggestionLabel(type: string): string {
  switch (type) {
    case 'data-motion':
      return '数据动画';
    case 'explainer-motion':
      return '解释动画';
    case 'chapter-transition':
      return '章节切场';
    default:
      return '内容卡片';
  }
}

export function AIVisualSuggestionList({
  storyboardPlan,
  autoApplyEnabled,
  onToggleAutoApply,
}: AIVisualSuggestionListProps) {
  const suggestions = storyboardPlan?.suggestions ?? [];

  return (
    <section className={styles.root} aria-label="视觉编排建议">
      <div className={styles.header}>
        <span className={styles.title}>视觉编排建议</span>
        <div className={styles.toggleRow}>
          <Checkbox
            checked={autoApplyEnabled}
            onChange={() => onToggleAutoApply?.(!autoApplyEnabled)}
            aria-label="自动应用到时间轴"
            size="sm"
          />
          <span>自动应用到时间轴</span>
        </div>
      </div>

      <div className={styles.hint}>
        这些建议会把内容卡片和动画统一编排起来。默认先给建议，再决定是否自动落轨。
      </div>

      {suggestions.length > 0 ? (
        <div className={styles.list}>
          {suggestions.map((suggestion) => (
            <article key={suggestion.id} className={styles.item}>
              <div className={styles.itemHead}>
                <span className={styles.itemTitle}>{getSuggestionLabel(suggestion.suggestionType)}</span>
                <div className={styles.meta}>
                  <Badge variant="secondary" size="xs">
                    {suggestion.templateKey}
                  </Badge>
                  <Badge variant="glass" size="xs">
                    {Math.round(suggestion.displayDurationMs / 100) / 10}s
                  </Badge>
                </div>
              </div>
              <div className={styles.reason}>{suggestion.reason}</div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          还没有视觉建议。先分析内容，系统会按字幕语义自动判断哪些段落适合做卡片或动画。
        </div>
      )}
    </section>
  );
}
