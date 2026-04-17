import { MOTION_SANDBOX_REFERENCE } from './motion-runtime';
import type { MotionAssetInfo, MotionCanvasSize, MotionGenerateParams } from '../types/motion';
import { getBuiltinPromptTemplate, renderTemplate, type PromptTemplate } from './prompts';

const DEFAULT_CANVAS_SIZE: MotionCanvasSize = {
  width: 1920,
  height: 1080,
};

function formatAssets(assets?: MotionAssetInfo[]): string {
  if (!assets || assets.length === 0) {
    return '无';
  }

  return assets
    .map((asset) => `- ${asset.name} (${asset.type})${asset.path ? ` -> ${asset.path}` : ''}`)
    .join('\n');
}

export function extractMotionCode(rawText: string): string {
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/```(?:tsx|ts|jsx|js)?\n?([\s\S]*?)```/i);
  return fencedMatch?.[1]?.trim() || trimmed;
}

export function buildMotionSystemPrompt(template?: PromptTemplate): string {
  const tpl = template ?? getBuiltinPromptTemplate('motion.system');
  return renderTemplate(tpl.user, { sandboxReference: MOTION_SANDBOX_REFERENCE });
}

export function buildMotionGenerateUserPrompt(
  params: MotionGenerateParams,
  template?: PromptTemplate,
): string {
  const tpl = template ?? getBuiltinPromptTemplate('motion.generate');
  const canvasSize = params.canvasSize ?? DEFAULT_CANVAS_SIZE;
  const durationMs = params.durationMs ?? 5_000;
  return renderTemplate(tpl.user, {
    userPrompt: params.prompt.trim(),
    canvasWidth: canvasSize.width,
    canvasHeight: canvasSize.height,
    durationMs,
    displayMode: params.displayMode ?? 'fullscreen',
    assets: formatAssets(params.assets),
  });
}

export function buildMotionModifyUserPrompt(
  params: {
    sourceCode: string;
    instruction: string;
  },
  template?: PromptTemplate,
): string {
  const tpl = template ?? getBuiltinPromptTemplate('motion.modify');
  return renderTemplate(tpl.user, {
    instruction: params.instruction.trim(),
    sourceCode: params.sourceCode.trim(),
  });
}

export function buildMotionAutoFixUserPrompt(
  params: {
    sourceCode: string;
    error: string;
    stage?: 'compile' | 'runtime';
  },
  template?: PromptTemplate,
): string {
  const tpl = template ?? getBuiltinPromptTemplate('motion.autofix');
  return renderTemplate(tpl.user, {
    stage: params.stage ?? 'compile',
    error: params.error.trim(),
    sourceCode: params.sourceCode.trim(),
  });
}

export { DEFAULT_CANVAS_SIZE };
