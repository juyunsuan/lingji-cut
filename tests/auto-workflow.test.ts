import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useAIStore } from '../src/store/ai';
import type { WorkflowStep } from '../src/store/ai';
import type { AppPage } from '../src/lib/electron-api';
import { runScriptGenerating } from '../src/lib/auto-workflow';
import * as scriptUtils from '../src/lib/script-utils';

const electronAPIMock = {
  saveScriptFile: vi.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  electronAPIMock.saveScriptFile.mockClear();
  (globalThis as unknown as { window: typeof globalThis }).window =
    globalThis as unknown as typeof globalThis;
  (globalThis as unknown as { window: { electronAPI: typeof electronAPIMock } }).window.electronAPI =
    electronAPIMock;
});

describe('WorkflowStep type extensions', () => {
  it('accepts script_generating and douyin_importing as valid steps', () => {
    const s1: WorkflowStep = 'script_generating';
    const s2: WorkflowStep = 'douyin_importing';
    expect(s1).toBe('script_generating');
    expect(s2).toBe('douyin_importing');
  });
});

describe('AIStore.pendingAutoParams', () => {
  it('starts null and accepts set/clear', () => {
    useAIStore.getState().setPendingAutoParams(null);
    expect(useAIStore.getState().pendingAutoParams).toBeNull();
    useAIStore
      .getState()
      .setPendingAutoParams({ templateId: 'news-broadcast', roleId: 'none', voiceId: 'female-shaonv' });
    expect(useAIStore.getState().pendingAutoParams?.voiceId).toBe('female-shaonv');
    useAIStore.getState().setPendingAutoParams(null);
    expect(useAIStore.getState().pendingAutoParams).toBeNull();
  });
});

describe('AppPage type extension', () => {
  it('accepts auto-run', () => {
    const p: AppPage = 'auto-run';
    expect(p).toBe('auto-run');
  });
});

describe('runScriptGenerating', () => {
  it('writes script.md and returns the generated text', async () => {
    vi.spyOn(scriptUtils, 'generateScriptDraft').mockResolvedValue('生成的口播稿');
    const result = await runScriptGenerating({
      originalText: '原始素材',
      projectDir: '/tmp/proj',
      params: { templateId: 'news-broadcast', roleId: 'none', voiceId: 'x' },
    });
    expect(result).toBe('生成的口播稿');
    expect(scriptUtils.generateScriptDraft).toHaveBeenCalledWith('原始素材', 'news-broadcast', 'none');
    expect(electronAPIMock.saveScriptFile).toHaveBeenCalledWith('/tmp/proj', 'script.md', '生成的口播稿');
  });

  it('throws when originalText is empty', async () => {
    await expect(
      runScriptGenerating({
        originalText: '   ',
        projectDir: '/tmp/proj',
        params: { templateId: 'x', roleId: 'none', voiceId: 'x' },
      }),
    ).rejects.toThrow('原始素材为空');
  });

  it('throws when projectDir is empty', async () => {
    await expect(
      runScriptGenerating({
        originalText: 'abc',
        projectDir: '',
        params: { templateId: 'x', roleId: 'none', voiceId: 'x' },
      }),
    ).rejects.toThrow('未选择项目目录');
  });
});
