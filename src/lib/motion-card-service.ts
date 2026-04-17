import type { AISettings } from '../types/ai';
import type {
  MotionCardResult,
  MotionCompileResult,
  MotionGenerateParams,
  MotionModifyParams,
} from '../types/motion';
import { generateText } from './llm';
import { autoFixMotionSource } from './motion-auto-fix';
import { compileMotionSource } from './motion-compiler';
import {
  buildMotionGenerateUserPrompt,
  buildMotionModifyUserPrompt,
  buildMotionSystemPrompt,
  extractMotionCode,
} from './motion-prompt';
import { MOTION_SANDBOX_REFERENCE } from './motion-runtime';
import type { PromptTemplate } from './prompts';

export interface MotionPromptTemplates {
  system?: PromptTemplate;
  generate?: PromptTemplate;
  modify?: PromptTemplate;
  autofix?: PromptTemplate;
}

export interface MotionCardService {
  generate(params: MotionGenerateParams): Promise<MotionCardResult>;
  modify(params: MotionModifyParams): Promise<MotionCardResult>;
  compile(params: { sourceCode: string }): MotionCompileResult;
  getApiReference(): string;
}

interface MotionCardServiceOptions {
  settings: AISettings;
  generateTextImpl?: typeof generateText;
  compileImpl?: (sourceCode: string) => MotionCompileResult;
  autoFixImpl?: typeof autoFixMotionSource;
  templates?: MotionPromptTemplates;
}

async function resolveMotionCard(
  settings: AISettings,
  rawText: string,
  options: {
    prompt: string;
    generateTextImpl?: typeof generateText;
    compileImpl?: (sourceCode: string) => MotionCompileResult;
    autoFixImpl?: typeof autoFixMotionSource;
    templates?: MotionPromptTemplates;
  },
): Promise<MotionCardResult> {
  const sourceCode = extractMotionCode(rawText);
  const compileImpl = options.compileImpl ?? compileMotionSource;
  const compileResult = compileImpl(sourceCode);

  if (compileResult.success) {
    return {
      success: true,
      sourceCode,
      compiledCode: compileResult.compiledCode,
      retryCount: 0,
    };
  }

  const autoFixImpl = options.autoFixImpl ?? autoFixMotionSource;
  return autoFixImpl({
    settings,
    sourceCode,
    error: compileResult.error,
    stage: 'compile',
    generateTextImpl: options.generateTextImpl,
    compileImpl,
    templates: options.templates,
  });
}

export function createMotionCardService(options: MotionCardServiceOptions): MotionCardService {
  const {
    settings,
    generateTextImpl = generateText,
    compileImpl = compileMotionSource,
    autoFixImpl = autoFixMotionSource,
    templates,
  } = options;

  return {
    async generate(params) {
      const rawText = await generateTextImpl(
        settings,
        buildMotionSystemPrompt(templates?.system),
        buildMotionGenerateUserPrompt(params, templates?.generate),
      );

      return resolveMotionCard(settings, rawText, {
        prompt: params.prompt,
        generateTextImpl,
        compileImpl,
        autoFixImpl,
        templates,
      });
    },

    async modify(params) {
      const rawText = await generateTextImpl(
        settings,
        buildMotionSystemPrompt(templates?.system),
        buildMotionModifyUserPrompt(params, templates?.modify),
      );

      return resolveMotionCard(settings, rawText, {
        prompt: params.instruction,
        generateTextImpl,
        compileImpl,
        autoFixImpl,
        templates,
      });
    },

    compile({ sourceCode }) {
      return compileImpl(sourceCode);
    },

    getApiReference() {
      return MOTION_SANDBOX_REFERENCE;
    },
  };
}
