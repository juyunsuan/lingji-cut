// src/components/script/StepIndicator.tsx
import { Check } from 'lucide-react';
import type { ScriptStep } from '../../store/script';

interface StepIndicatorProps {
  currentStep: ScriptStep;
  onStepClick?: (step: ScriptStep) => void;
}

const STEPS = [
  { step: 1 as const, label: '项目初始化' },
  { step: 2 as const, label: '原稿审查' },
  { step: 3 as const, label: '生成口播稿' },
  { step: 4 as const, label: 'AI 审查' },
  { step: 5 as const, label: '确认保存' },
];

export function StepIndicator({ currentStep, onStepClick }: StepIndicatorProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 56,
        gap: 0,
        background: 'var(--color-panel-bg)',
        borderBottom: '1px solid var(--color-border-subtle)',
        padding: '0 40px',
      }}
    >
      {STEPS.map(({ step, label }, index) => {
        const isCompleted = step < currentStep;
        const isActive = step === currentStep;
        const canClick = isCompleted && onStepClick;

        return (
          <div key={step} style={{ display: 'contents' }}>
            <div
              role={canClick ? 'button' : undefined}
              tabIndex={canClick ? 0 : undefined}
              onClick={canClick ? () => onStepClick(step) : undefined}
              onKeyDown={canClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onStepClick(step); } : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: canClick ? 'pointer' : 'default',
                borderRadius: 8,
                padding: '4px 8px',
                transition: 'background 0.15s',
                ...(canClick ? { ':hover': { background: '#ffffff10' } } : {}),
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  ...(isCompleted
                    ? { background: '#32D74B', color: '#fff' }
                    : isActive
                      ? { background: '#0A84FF', color: '#fff' }
                      : {
                          background: 'transparent',
                          border: '1.5px solid #48484A',
                          color: '#EBEBF54D',
                        }),
                }}
              >
                {isCompleted ? <Check size={14} /> : step}
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 500,
                  color: isCompleted
                    ? '#32D74B'
                    : isActive
                      ? '#0A84FF'
                      : '#EBEBF54D',
                }}
              >
                {label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                style={{
                  width: 60,
                  height: 2,
                  borderRadius: 1,
                  background: isCompleted
                    ? '#32D74B'
                    : isActive
                      ? '#0A84FF'
                      : '#48484A',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
