import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

import { getLlmProviderForModel } from './llm-provider';

export function createLlmModel(apiKey: string, modelId: string): LanguageModel {
  const provider = getLlmProviderForModel(modelId);
  if (provider === 'anthropic') {
    return createAnthropic({ apiKey })(modelId);
  }
  return createOpenAI({ apiKey })(modelId);
}
