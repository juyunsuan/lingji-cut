import type { BrowserWindow } from 'electron';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getPipelineService, type TaskHandle } from '.';
import type { PipelineTaskKind } from './types';
import { runTtsHeadless } from './runs/tts-run';

const PROJECT_UPDATED_CHANNEL = 'pipeline:project-updated';

export interface GenerationRunCtx {
  projectPath: string;
  userDataPath: string;
  handle: TaskHandle;
}

export interface GenerationToolConfig {
  name: string;
  title: string;
  description: string;
  kind: PipelineTaskKind;
  /** 任务完成后写回的 project 节，用于 UI 刷新信号 */
  sections: string[];
  run: (ctx: GenerationRunCtx) => Promise<unknown>;
}

function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
function errorResult(message: string, code?: string) {
  const payload: Record<string, unknown> = { error: message };
  if (code) payload.code = code;
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }], isError: true };
}

/** 通知渲染进程某项目的指定节已更新（若该项目正打开则刷新 UI） */
export function emitProjectUpdated(
  getMainWindow: () => BrowserWindow | null,
  projectPath: string,
  sections: string[],
): void {
  try {
    getMainWindow()?.webContents.send(PROJECT_UPDATED_CHANNEL, { projectPath, sections });
  } catch {
    // 渲染窗口可能已关闭
  }
}

/** 注册一个 headless 生成工具：createTask → 后台 run → 发刷新信号 → 返回 taskId */
export function registerGenerationTool(
  server: McpServer,
  getMainWindow: () => BrowserWindow | null,
  getUserDataPath: () => string,
  config: GenerationToolConfig,
): void {
  server.registerTool(
    config.name,
    {
      title: config.title,
      description: config.description,
      inputSchema: { projectPath: z.string().describe('项目目录绝对路径') },
    },
    async ({ projectPath }) => {
      try {
        const userDataPath = getUserDataPath();
        const { taskId } = await getPipelineService().createTask(
          config.kind,
          projectPath,
          async (handle) => {
            const result = await config.run({ projectPath, userDataPath, handle });
            emitProjectUpdated(getMainWindow, projectPath, config.sections);
            return result;
          },
        );
        return jsonResult({ taskId, kind: config.kind });
      } catch (err) {
        const e = err as { code?: string; message?: string };
        return errorResult(e?.message ?? String(err), e?.code);
      }
    },
  );
}

/** 注册全部 headless 生成工具（本计划：音频；后续计划追加） */
export function registerGenerationTools(
  server: McpServer,
  getMainWindow: () => BrowserWindow | null,
  getUserDataPath: () => string,
): void {
  registerGenerationTool(server, getMainWindow, getUserDataPath, {
    name: 'lingji_generate_audio',
    title: '生成口播音频(TTS)',
    description:
      '读取项目 script.md，用应用已配置的 MiniMax TTS 生成 podcast-audio.mp3 与 podcast-subtitles.srt；返回 taskId（fire-and-poll）。',
    kind: 'tts',
    sections: ['timeline'],
    run: (ctx) => runTtsHeadless(ctx),
  });
}
