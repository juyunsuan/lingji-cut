import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { runTTSProvider, type TTSRunnerOptions, type TTSRunnerResult } from '../../tts-provider-runner';
import { loadHeadlessTTSConfig } from '../headless-settings';
import { GenerationError } from '../generation-error';
import type { GenerationRunCtx } from '../headless-generation';

export interface TtsRunResult {
  audioPath: string;
  srtPath: string;
  durationMs: number;
}

interface TtsRunDeps {
  runner?: (options: TTSRunnerOptions) => Promise<TTSRunnerResult>;
}

/** 主进程 headless 生成口播音频 + 字幕（仅 MiniMax）。runner 可注入用于测试。 */
export async function runTtsHeadless(
  ctx: GenerationRunCtx,
  deps: TtsRunDeps = {},
): Promise<TtsRunResult> {
  const runner = deps.runner ?? runTTSProvider;
  const { projectPath, userDataPath, handle } = ctx;

  handle.update({ phase: '装配设置', percent: 5 });
  const { provider, voice } = await loadHeadlessTTSConfig(userDataPath);
  if (provider.type !== 'minimax') {
    throw new GenerationError(
      'unsupported_tts',
      `headless TTS 当前仅支持 MiniMax provider（实际为 ${provider.type}）。请在应用界面生成克隆音色。`,
    );
  }

  let text: string;
  try {
    text = await readFile(join(projectPath, 'script.md'), 'utf-8');
  } catch {
    throw new GenerationError('no_script', '未找到 script.md，请先生成口播稿。');
  }
  if (!text.trim()) {
    throw new GenerationError('empty_script', 'script.md 为空。');
  }

  handle.update({ phase: '合成语音', percent: 20 });
  const result = await runner({ text, provider, voice, signal: handle.signal });
  if (!result.audioBuffer?.length) {
    throw new GenerationError('empty_audio', 'TTS 返回空音频。');
  }

  handle.update({ phase: '写入文件', percent: 80 });
  await mkdir(projectPath, { recursive: true });
  const audioPath = join(projectPath, `podcast-audio.${result.audioExtension}`);
  await writeFile(audioPath, result.audioBuffer);

  const durationMs =
    result.durationMs && result.durationMs > 0 ? result.durationMs : Math.max(1000, text.length * 200);
  const srtText = result.subtitleText ?? '';
  const srtPath = join(projectPath, 'podcast-subtitles.srt');
  const originalSrtPath = join(projectPath, 'podcast-subtitles.original.srt');
  await writeFile(srtPath, srtText, 'utf-8');
  await writeFile(originalSrtPath, srtText, 'utf-8');

  handle.update({ phase: '完成', percent: 100 });
  return { audioPath, srtPath, durationMs };
}
