import type { LlmProvider } from './llm-provider';

/** Whether the model accepts a `temperature` parameter for generation. */
export function modelSupportsTemperature(modelId: string, provider: LlmProvider): boolean {
  if (provider === 'anthropic') return true;
  const id = modelId.toLowerCase();
  if (id.startsWith('gpt-5')) return false;
  if (id.startsWith('o1') || id.startsWith('o3')) return false;
  return true;
}
