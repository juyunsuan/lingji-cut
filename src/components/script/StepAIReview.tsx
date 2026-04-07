// src/components/script/StepAIReview.tsx
import {
  ArrowLeft,
  ArrowRight,
  CheckCheck,
  CircleX,
  Info,
  MessageSquare,
  TriangleAlert,
  CircleCheck,
} from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useScriptStore } from '../../store/script';
import type { Annotation, AnnotationSeverity } from '../../store/script';
import { reviewScript } from '../../lib/script-review';
import { loadAISettings } from '../../store/ai';

const SEVERITY_CONFIG: Record<
  AnnotationSeverity,
  { icon: typeof Info; color: string; label: string }
> = {
  error: { icon: CircleX, color: '#FF453A', label: 'error' },
  warning: { icon: TriangleAlert, color: '#FF9F0A', label: 'warning' },
  info: { icon: Info, color: '#0A84FF', label: 'info' },
};

function AnnotationCard({
  annotation,
  index,
  onAccept,
  onDismiss,
}: {
  annotation: Annotation;
  index: number;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const config = SEVERITY_CONFIG[annotation.severity];
  const Icon = config.icon;
  const isAccepted = annotation.status === 'accepted';
  const isDismissed = annotation.status === 'dismissed';
  const isPending = annotation.status === 'pending';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '12px 14px',
        borderRadius: 10,
        border: `1px solid ${isPending ? config.color : isAccepted ? '#32D74B40' : '#48484A'}`,
        background: isAccepted
          ? '#32D74B0D'
          : isPending
            ? `color-mix(in srgb, ${config.color} 8%, transparent)`
            : '#2C2C2E',
        opacity: isDismissed ? 0.5 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {isAccepted ? (
          <CircleCheck size={14} color="#32D74B" />
        ) : (
          <Icon size={14} color={config.color} />
        )}
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: isAccepted ? '#32D74B' : config.color,
          }}
        >
          {isAccepted ? '已采纳' : isDismissed ? '已忽略' : '待处理'}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: '#EBEBF54D' }}>
          #{index + 1} · {config.label}
        </span>
      </div>

      <div style={{ fontSize: 12, color: '#EBEBF599', lineHeight: 1.5 }}>
        &quot;{annotation.originalText}&quot; → {annotation.issue}
      </div>

      {isPending && annotation.suggestion !== annotation.originalText && (
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            background: `color-mix(in srgb, ${config.color} 5%, transparent)`,
            fontSize: 12,
            color: '#EBEBF599',
            lineHeight: 1.4,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: `color-mix(in srgb, ${config.color} 60%, white)`, marginBottom: 4 }}>
            建议修改为：
          </div>
          &quot;{annotation.suggestion}&quot;
        </div>
      )}

      {isPending && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onDismiss}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid #48484A',
              background: 'transparent',
              color: '#EBEBF599',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            忽略
          </button>
          <button
            type="button"
            onClick={onAccept}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: config.color,
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            采纳修改
          </button>
        </div>
      )}
    </div>
  );
}

export function StepAIReview() {
  const {
    scriptText,
    annotations,
    reviewing,
    setAnnotations,
    setReviewing,
    acceptAnnotation,
    dismissAnnotation,
    acceptAllAnnotations,
    setCurrentStep,
  } = useScriptStore();

  const pendingCount = useMemo(
    () => annotations.filter((a) => a.status === 'pending').length,
    [annotations],
  );
  const processedCount = annotations.length - pendingCount;

  const handleStartReview = useCallback(async () => {
    const settings = loadAISettings();
    if (!settings?.llmApiKey) {
      alert('请先在 AI 设置中配置 LLM API Key');
      return;
    }

    setReviewing(true);
    try {
      const result = await reviewScript(settings, scriptText);
      setAnnotations(result);
    } catch (error) {
      console.error('AI 审查失败:', error);
      alert(`审查失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setReviewing(false);
    }
  }, [scriptText, setAnnotations, setReviewing]);

  const hasAnnotations = annotations.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <MessageSquare size={16} color="#FF9F0A" />
        <span style={{ fontSize: 14, fontWeight: 600 }}>AI 审查批注</span>
        <div style={{ flex: 1 }} />
        {hasAnnotations && (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 10,
              background: pendingCount > 0 ? '#FF9F0A' : '#32D74B',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {processedCount}/{annotations.length}
          </span>
        )}
      </div>

      <div style={{ borderTop: '1px solid #38383A' }} />

      {!hasAnnotations ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '20px 0' }}>
          <MessageSquare size={32} color="#EBEBF54D" />
          <span style={{ fontSize: 13, color: '#EBEBF599' }}>
            {reviewing ? 'AI 正在审查口播稿…' : '点击下方按钮开始 AI 审查'}
          </span>
          <button
            type="button"
            disabled={reviewing}
            onClick={() => { void handleStartReview(); }}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: 'none',
              background: '#0A84FF',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: reviewing ? 'wait' : 'pointer',
            }}
          >
            {reviewing ? '审查中…' : '开始 AI 审查'}
          </button>
          {!reviewing && (
            <button
              type="button"
              onClick={() => setCurrentStep(5)}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: '1px solid #48484A',
                background: 'transparent',
                color: '#EBEBF599',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              跳过审查，直接下一步 →
            </button>
          )}
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            flex: 1,
            overflowY: 'auto',
            minHeight: 0,
          }}
        >
          {annotations.map((ann, i) => (
            <AnnotationCard
              key={ann.id}
              annotation={ann}
              index={i}
              onAccept={() => acceptAnnotation(ann.id)}
              onDismiss={() => dismissAnnotation(ann.id)}
            />
          ))}
        </div>
      )}

      <div style={{ flex: hasAnnotations ? 0 : 1 }} />

      <div style={{ borderTop: '1px solid #38383A' }} />

      {hasAnnotations && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            disabled={pendingCount === 0}
            onClick={acceptAllAnnotations}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 0',
              borderRadius: 8,
              border: 'none',
              background: '#3A3A3C',
              color: pendingCount > 0 ? '#EBEBF599' : '#EBEBF54D',
              fontSize: 13,
              fontWeight: 500,
              cursor: pendingCount > 0 ? 'pointer' : 'default',
            }}
          >
            <CheckCheck size={14} />
            全部采纳
          </button>
          <button
            type="button"
            onClick={() => setCurrentStep(5)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 0',
              borderRadius: 8,
              border: 'none',
              background: '#0A84FF',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            完成审查
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setCurrentStep(3)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '8px 0',
          borderRadius: 8,
          border: '1px solid #48484A',
          background: 'transparent',
          color: '#EBEBF599',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        <ArrowLeft size={14} />
        上一步
      </button>
    </div>
  );
}
