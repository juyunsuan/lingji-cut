import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { AISettings } from '../../types/ai';
import {
  extractReasoningContent,
  extractTextContent,
  parseLLMJsonResponse,
  parseStructuredOutput,
} from './content';
import { createChatModel } from './model';

export interface StreamCallbacks {
  onReasoningChunk?: (chunk: string) => void;
}

export { parseLLMJsonResponse };

function buildPromptMessages(systemPrompt: string, userMessage: string) {
  return [new SystemMessage(systemPrompt), new HumanMessage(userMessage)];
}

function assertNonEmptyContent(content: string, message: string): string {
  if (!content) {
    throw new Error(message);
  }

  return content;
}

export async function generateStructuredData(
  settings: AISettings,
  systemPrompt: string,
  userMessage: string,
): Promise<Record<string, unknown>> {
  const chatModel = createChatModel(settings) as ReturnType<typeof createChatModel> & {
    bind?: (kwargs: Record<string, unknown>) => {
      invoke: (messages: unknown[]) => Promise<{ content: unknown }>;
    };
  };
  const model =
    typeof chatModel.bind === 'function'
      ? chatModel.bind({
          response_format: { type: 'json_object' },
        })
      : chatModel;
  const response = await model.invoke(buildPromptMessages(systemPrompt, userMessage));
  const content = assertNonEmptyContent(extractTextContent(response.content), 'LLM 返回空内容');
  return parseStructuredOutput(content);
}

export async function generateText(
  settings: AISettings,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const response = await createChatModel(settings).invoke(buildPromptMessages(systemPrompt, userMessage));

  return assertNonEmptyContent(extractTextContent(response.content), 'LLM 返回空内容');
}

export async function streamText(
  settings: AISettings,
  systemPrompt: string,
  userMessage: string,
  onChunk: (chunk: string) => void,
  callbacks?: StreamCallbacks,
): Promise<string> {
  const stream = await createChatModel(settings).stream(buildPromptMessages(systemPrompt, userMessage));
  let fullText = '';

  for await (const chunk of stream) {
    const reasoningChunk = extractReasoningContent(chunk);
    if (reasoningChunk) {
      callbacks?.onReasoningChunk?.(reasoningChunk);
    }

    const textChunk = extractTextContent(chunk.content);
    if (!textChunk) {
      continue;
    }

    fullText += textChunk;
    onChunk(textChunk);
  }

  return assertNonEmptyContent(fullText, 'LLM 流式返回空内容');
}
