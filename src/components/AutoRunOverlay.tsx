import type { WorkflowStep } from '../store/ai';
import { Button } from '../ui';

const STEP_ORDER: WorkflowStep[] = [
  'douyin_importing',
  'script_generating',
  'tts_generating',
  'ai_analyzing',
  'cover_generating',
  'arranging',
];

const STEP_LABELS: Record<WorkflowStep, string> = {
  idle: '准备中',
  douyin_importing: '导入抖音',
  script_generating: '撰写口播稿',
  tts_generating: '合成语音',
  tts_done: '合成语音',
  ai_analyzing: '内容分析 / 字幕高亮',
  cover_generating: '生成封面',
  arranging: '时间轴排布',
  done: '完成',
  error: '出错',
};

const SCRIPT_WORKBENCH_FAIL_STEPS: WorkflowStep[] = [
  'douyin_importing',
  'script_generating',
  'tts_generating',
];

export interface AutoRunOverlayProps {
  step: WorkflowStep;
  stepLabel: string;
  progress: number;
  error: { message: string; failedStep: WorkflowStep } | null;
  onCancel: () => void;
  onJumpToScriptWorkbench: () => void;
  onJumpToEditor: () => void;
}

export function AutoRunOverlay({
  step,
  stepLabel,
  progress,
  error,
  onCancel,
  onJumpToScriptWorkbench,
  onJumpToEditor,
}: AutoRunOverlayProps) {
  const isError = step === 'error' && error !== null;
  const failedStep = error?.failedStep;
  const earlyFailure = failedStep && SCRIPT_WORKBENCH_FAIL_STEPS.includes(failedStep);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          minWidth: 480,
          maxWidth: 640,
          padding: 'var(--space-8)',
          background: 'var(--color-surface-elevated)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <h2 style={{ margin: 0 }}>正在为你一键成稿</h2>
        <div style={{ color: 'var(--color-text-secondary)' }}>
          {isError ? error.message : stepLabel || STEP_LABELS[step]}
        </div>
        <div
          aria-label="step indicators"
          style={{ display: 'flex', gap: 'var(--space-2)' }}
        >
          {STEP_ORDER.map((s) => {
            const reached = STEP_ORDER.indexOf(s) <= STEP_ORDER.indexOf(step as WorkflowStep);
            return (
              <span
                key={s}
                title={STEP_LABELS[s]}
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 3,
                  background: reached ? 'var(--color-system-blue)' : 'var(--color-border)',
                }}
              />
            );
          })}
        </div>
        <div aria-label="overall progress" style={{ fontSize: 14 }}>
          {Math.round(progress)}%
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          {!isError && (
            <Button variant="secondary" onClick={onCancel}>
              取消
            </Button>
          )}
          {isError && earlyFailure && (
            <Button variant="primary" onClick={onJumpToScriptWorkbench}>
              查看脚本工作台
            </Button>
          )}
          {isError && !earlyFailure && (
            <Button variant="primary" onClick={onJumpToEditor}>
              进入编辑器
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
