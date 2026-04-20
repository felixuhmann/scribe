import { ANTHROPIC_MODELS } from './anthropic-models';

export type LlmProvider = 'openai' | 'anthropic';

const anthropicModelIds = new Set<string>(ANTHROPIC_MODELS.map((m) => m.id));

export function getLlmProviderForModel(modelId: string): LlmProvider {
  if (anthropicModelIds.has(modelId)) return 'anthropic';
  if (modelId.toLowerCase().startsWith('claude-')) return 'anthropic';
  return 'openai';
}
