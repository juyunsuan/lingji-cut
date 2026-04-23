import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('AI video workflow regressions', () => {
  it('guards stale or canceled TTS runs before surfacing workflow errors', () => {
    const source = readFileSync(
      new URL('../src/hooks/useAIVideoWorkflow.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('const currentRequestId = workflowSession.requestId');
    expect(source).toContain('workflowSession.requestId !== currentRequestId');
    expect(source).toContain("requestId: currentRequestId");
  });

  it('supports resuming AI clip generation from content analysis when reusable media is confirmed', () => {
    const workflowSource = readFileSync(
      new URL('../src/hooks/useAIVideoWorkflow.ts', import.meta.url),
      'utf8',
    );
    const editorSource = readFileSync(
      new URL('../src/pages/Editor.tsx', import.meta.url),
      'utf8',
    );

    expect(workflowSource).toContain('startFromStep?:');
    // initialStep 现在同时考虑 autoMode：autoMode=true 时默认从 script_generating 开始
    expect(workflowSource).toContain(
      "options?.startFromStep ?? (options?.autoMode ? 'script_generating' : 'tts_generating')",
    );
    expect(workflowSource).toContain('void runFromStep(initialStep, text, workflowSession.projectDir);');
    expect(editorSource).toContain('readStoredExistingMediaDecision');
    expect(editorSource).toContain('writeStoredExistingMediaDecision');
    expect(editorSource).toContain('记住我的选择，后续默认这样处理');
    expect(editorSource).toContain('跳过已有并继续');
  });

  it('creates a task-progress item even when AI clip generation resumes from reusable media', () => {
    const workflowSource = readFileSync(
      new URL('../src/hooks/useAIVideoWorkflow.ts', import.meta.url),
      'utf8',
    );

    expect(workflowSource).toContain('function ensureWorkflowTask');
    expect(workflowSource).toContain("category: 'ai-analyze'");
    expect(workflowSource).toContain("label: 'AI 内容分析'");
  });

  it('keeps task-progress synchronized during the arranging phase', () => {
    const workflowSource = readFileSync(
      new URL('../src/hooks/useAIVideoWorkflow.ts', import.meta.url),
      'utf8',
    );

    expect(workflowSource).toContain("label: '时间轴排布'");
    expect(workflowSource).toContain("phase: '排布中'");
    expect(workflowSource).toContain("category: 'ai-analyze'");
  });

  it('keeps subtitle replacement on the new confirmation-based AI invalidation path', () => {
    const appSource = readFileSync(
      new URL('../src/App.tsx', import.meta.url),
      'utf8',
    );
    const editorSource = readFileSync(
      new URL('../src/pages/Editor.tsx', import.meta.url),
      'utf8',
    );

    expect(appSource).toContain('const storyboardPlan = useAIStore.getState().storyboardPlan;');
    expect(appSource).toContain('createPersistedAIState(null, [], motionCards, storyboardPlan)');
    expect(appSource).toContain('const shouldReanalyze = window.confirm(');
    expect(appSource).toContain('await rerunAiAnalysisForEntries(entries);');
    expect(editorSource).toContain('open={Boolean(pendingReanalyzeEntries)}');
    expect(editorSource).toContain('void rerunAiAnalysisForCurrentSrt(pendingReanalyzeEntries);');
  });
});
