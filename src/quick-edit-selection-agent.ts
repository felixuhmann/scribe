import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

export type QuickEditLlmOptions = {
  model: string;
  maxOutputTokens: number;
};

function openAiModelSupportsTemperature(modelId: string): boolean {
  const id = modelId.toLowerCase();
  if (id.startsWith('gpt-5')) return false;
  if (id.startsWith('o1') || id.startsWith('o3')) return false;
  return true;
}

export async function runQuickEditSelection(
  apiKey: string,
  input: { selectedText: string; instruction: string },
  llm: QuickEditLlmOptions,
  abortSignal?: AbortSignal,
): Promise<string> {
  const openai = createOpenAI({ apiKey });
  const { text } = await generateText({
    model: openai(llm.model),
    abortSignal,
    maxOutputTokens: llm.maxOutputTokens,
    ...(openAiModelSupportsTemperature(llm.model) ? { temperature: 0.25 } : {}),
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
