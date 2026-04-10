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

  it('keeps subtitle replacement on the new confirmation-based AI invalidation path', () => {
    const appSource = readFileSync(
      new URL('../src/App.tsx', import.meta.url),
      'utf8',
    );
    const editorSource = readFileSync(
      new URL('../src/pages/Editor.tsx', import.meta.url),
      'utf8',
    );

    expect(appSource).toContain('createPersistedAIState(null, [])');
    expect(appSource).toContain('const shouldReanalyze = window.confirm(');
    expect(appSource).toContain('await rerunAiAnalysisForEntries(entries);');
    expect(editorSource).toContain('const shouldReanalyze = window.confirm(');
    expect(editorSource).toContain('await rerunAiAnalysisForCurrentSrt(entries);');
  });
});
