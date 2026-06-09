import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runTtsHeadless } from '../electron/pipeline/runs/tts-run';

function setup(opts: { script?: string; providerType?: string } = {}) {
  const userData = mkdtempSync(path.join(os.tmpdir(), 'lingji-ttsud-'));
  const project = mkdtempSync(path.join(os.tmpdir(), 'lingji-ttsproj-'));
  writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
    aiSettings: {
      ttsProviders: [{ id: 'p1', name: 'MiniMax', type: opts.providerType ?? 'minimax', baseUrl: 'https://api', apiKey: 'sk-x', models: ['speech-01'] }],
      ttsVoices: [{ id: 'v1', name: '女声', providerId: 'p1', providerType: opts.providerType ?? 'minimax', model: 'speech-01', voiceId: 'female-1', source: 'preset', params: {} }],
      defaultTtsProviderId: 'p1', defaultTtsVoiceId: 'v1',
    },
  }));
  if (opts.script !== undefined) writeFileSync(path.join(project, 'script.md'), opts.script);
  return { userData, project };
}

const fakeHandle = () => ({
  taskId: 't', signal: new AbortController().signal,
  update: () => {}, log: () => {},
});

describe('runTtsHeadless', () => {
  it('reads script.md, calls runner, writes audio + srt files', async () => {
    const { userData, project } = setup({ script: '你好世界。这是测试。' });
    try {
      const runner = async () => ({
        audioBuffer: Buffer.from('FAKEAUDIO'),
        audioExtension: 'mp3' as const,
        subtitleText: '1\n00:00:00,000 --> 00:00:01,000\n你好世界\n',
        durationMs: 1000,
      });
      const res = await runTtsHeadless(
        { projectPath: project, userDataPath: userData, handle: fakeHandle() as never },
        { runner },
      );
      expect(res.audioPath).toBe(path.join(project, 'podcast-audio.mp3'));
      expect(res.durationMs).toBe(1000);
      expect(existsSync(res.audioPath)).toBe(true);
      expect(readFileSync(res.audioPath).toString()).toBe('FAKEAUDIO');
      expect(existsSync(path.join(project, 'podcast-subtitles.srt'))).toBe(true);
      expect(existsSync(path.join(project, 'podcast-subtitles.original.srt'))).toBe(true);
    } finally {
      rmSync(userData, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('throws no_script when script.md missing', async () => {
    const { userData, project } = setup({});
    try {
      await expect(
        runTtsHeadless({ projectPath: project, userDataPath: userData, handle: fakeHandle() as never }, { runner: async () => ({ audioBuffer: Buffer.from('x'), audioExtension: 'mp3' as const }) }),
      ).rejects.toMatchObject({ code: 'no_script' });
    } finally {
      rmSync(userData, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('throws unsupported_tts for non-minimax provider', async () => {
    const { userData, project } = setup({ script: 'hi', providerType: 'xiaomi_mimo' });
    try {
      await expect(
        runTtsHeadless({ projectPath: project, userDataPath: userData, handle: fakeHandle() as never }, { runner: async () => ({ audioBuffer: Buffer.from('x'), audioExtension: 'wav' as const }) }),
      ).rejects.toMatchObject({ code: 'unsupported_tts' });
    } finally {
      rmSync(userData, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }
  });
});
