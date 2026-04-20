import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

/** OpenAI chat models offered in Settings and the document chat bar (same persisted `model` setting). */
export const OPENAI_MODELS = [
  { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
  { id: 'gpt-5.4', label: 'GPT-5.4' },
] as const;

/** Anthropic chat models offered in Settings and the document chat bar (same persisted `model` setting). */
export const ANTHROPIC_MODELS = [
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
] as const;

export const KNOWN_CHAT_MODEL_IDS = new Set<string>([
  ...OPENAI_MODELS.map((m) => m.id),
  ...ANTHROPIC_MODELS.map((m) => m.id),
]);

export type LlmProvider = 'openai' | 'anthropic';

const anthropicModelIds = new Set<string>(ANTHROPIC_MODELS.map((m) => m.id));

export function providerForModel(modelId: string): LlmProvider {
  if (anthropicModelIds.has(modelId)) return 'anthropic';
  if (modelId.toLowerCase().startsWith('claude-')) return 'anthropic';
  return 'openai';
}

/** Whether the model accepts a `temperature` parameter for generation. */
export function modelSupportsTemperature(modelId: string, provider: LlmProvider): boolean {
  if (provider === 'anthropic') return true;
  const id = modelId.toLowerCase();
  if (id.startsWith('gpt-5')) return false;
  if (id.startsWith('o1') || id.startsWith('o3')) return false;
  return true;
}

/**
 * Deep entry point for building an LLM call. Hides provider detection, model
 * factory wiring, and the pass-temperature heuristic behind a single call.
 *
 * Callers spread `temperatureOption` into their AI SDK config so a temperature
 * is only sent to models that accept one.
 */
export function buildLlmCall(opts: {
  apiKey: string;
  modelId: string;
  /** Desired temperature. Only applied if the model/provider supports one. */
  temperature?: number;
}): {
  model: LanguageModel;
  provider: LlmProvider;
  temperatureOption: { temperature?: number };
} {
  const provider = providerForModel(opts.modelId);
  const model: LanguageModel =
    provider === 'anthropic'
      ? createAnthropic({ apiKey: opts.apiKey })(opts.modelId)
      : createOpenAI({ apiKey: opts.apiKey })(opts.modelId);
  const temperatureOption =
    opts.temperature != null && modelSupportsTemperature(opts.modelId, provider)
      ? { temperature: opts.temperature }
      : {};
  return { model, provider, temperatureOption };
}
