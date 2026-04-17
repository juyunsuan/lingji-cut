import { generateText } from './llm';
import { resolvePromptBinding } from './llm/binding-resolver';
import { compileMotionSource } from './motion-compiler';
import { buildMotionAutoFixUserPrompt, buildMotionSystemPrompt, extractMotionCode } from './motion-prompt';
import type { MotionCardResult, MotionCompileResult } from '../types/motion';
import type { AISettings, PromptBindingMap } from '../types/ai';
import type { MotionPromptTemplates } from './motion-card-service';

export interface MotionAutoFixOptions {
  settings: AISettings;
  /** 项目级提示词绑定快照；无项目上下文时传 null。 */
  projectBindings: PromptBindingMap | null;
  sourceCode: string;
  error: string;
  stage?: 'compile' | 'runtime';
  retryCount?: number;
  maxRetries?: number;
  generateTextImpl?: typeof generateText;
  compileImpl?: (sourceCode: string) => MotionCompileResult;
  templates?: MotionPromptTemplates;
}

export async function autoFixMotionSource(options: MotionAutoFixOptions): Promise<MotionCardResult> {
  const {
    settings,
    projectBindings,
    sourceCode,
    error,
    stage = 'compile',
    retryCount = 0,
    maxRetries = 3,
    generateTextImpl = generateText,
    compileImpl = compileMotionSource,
    templates,
  } = options;

  if (retryCount >= maxRetries) {
    return {
      success: false,
      error,
      retryCount,
      sourceCode,
    };
  }

  const binding = resolvePromptBinding('motion.autofix', settings, projectBindings);
  const rawText = await generateTextImpl(
    settings,
    buildMotionSystemPrompt(templates?.system),
    buildMotionAutoFixUserPrompt(
      {
        sourceCode,
        error,
        stage,
      },
      templates?.autofix,
    ),
    binding,
  );
  const nextSourceCode = extractMotionCode(rawText);
  const compileResult = compileImpl(nextSourceCode);
  const nextRetryCount = retryCount + 1;

  if (compileResult.success) {
    return {
      success: true,
      sourceCode: nextSourceCode,
      compiledCode: compileResult.compiledCode,
      retryCount: nextRetryCount,
    };
  }

  return autoFixMotionSource({
    settings,
    projectBindings,
    sourceCode: nextSourceCode,
    error: compileResult.error,
    stage: 'compile',
    retryCount: nextRetryCount,
    maxRetries,
    generateTextImpl,
    compileImpl,
    templates,
  });
}
