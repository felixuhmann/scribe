import { ANTHROPIC_MODELS } from './anthropic-models';
import { OPENAI_MODELS } from './openai-models';

export { ANTHROPIC_MODELS, OPENAI_MODELS };

export const KNOWN_CHAT_MODEL_IDS = new Set<string>([
  ...OPENAI_MODELS.map((m) => m.id),
  ...ANTHROPIC_MODELS.map((m) => m.id),
]);
