import { generateText } from 'ai';

import { createLlmModel } from '../lib/create-llm-model';
import { getLlmProviderForModel } from '../lib/llm-provider';
import { modelSupportsTemperature } from '../lib/model-temperature';

export type QuickEditLlmOptions = {
  model: string;
  maxOutputTokens: number;
};

export async function runQuickEditSelection(
  apiKey: string,
  input: { selectedText: string; instruction: string },
  llm: QuickEditLlmOptions,
  abortSignal?: AbortSignal,
): Promise<string> {
  const provider = getLlmProviderForModel(llm.model);
  const { text } = await generateText({
    model: createLlmModel(apiKey, llm.model),
    abortSignal,
    maxOutputTokens: llm.maxOutputTokens,
    ...(modelSupportsTemperature(llm.model, provider) ? { temperature: 0.25 } : {}),
    system: `You revise a highlighted passage in a rich-text document.

Rules:
- Output ONLY the replacement passage — no quotation marks wrapping it, no markdown code fences, no preamble or explanation.
- Match the user's instruction precisely while keeping tone and voice consistent with the selected text unless they ask otherwise.
- Preserve factual content unless the instruction asks to change it.`,
    prompt: `SELECTED_TEXT:
"""
${input.selectedText}
"""

INSTRUCTION:
${input.instruction}`,
  });

  return (text ?? '').trim();
}
