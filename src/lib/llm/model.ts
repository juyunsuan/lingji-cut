import { ChatOpenAI } from '@langchain/openai';
import type { AISettings } from '../../types/ai';

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function buildModelKwargs(settings: AISettings): Record<string, unknown> | undefined {
  if (settings.enableThinking === false) {
    return {
      extra_body: {
        enable_thinking: false
      },
    };
  }

  return undefined;
}

export function createChatModel(settings: AISettings): ChatOpenAI {
  const modelKwargs = buildModelKwargs(settings);

  return new ChatOpenAI({
    apiKey: settings.llmApiKey,
    model: settings.llmModel,
    temperature: 0.3,
    configuration: {
      apiKey: settings.llmApiKey,
      baseURL: normalizeBaseUrl(settings.llmBaseUrl),
    },
    ...(modelKwargs ? { modelKwargs } : {}),
  });
}
