import { createOpenAI } from '@ai-sdk/openai';
import { stepCountIs, ToolLoopAgent } from 'ai';

export type AutocompleteLlmOptions = {
  model: string;
  temperature: number;
  maxOutputTokens: number;
};

/** OpenAI reasoning / Responses-path models ignore or reject `temperature`. */
function openAiModelSupportsTemperature(modelId: string): boolean {
  const id = modelId.toLowerCase();
  if (id.startsWith('gpt-5')) return false;
  if (id.startsWith('o1') || id.startsWith('o3')) return false;
  return true;
}

export async function runAutocomplete(
  apiKey: string,
  input: { before: string; after: string },
  llm: AutocompleteLlmOptions,
  abortSignal?: AbortSignal,
): Promise<string> {
  const openai = createOpenAI({ apiKey });
  const agent = new ToolLoopAgent({
    model: openai(llm.model),
    instructions: `You are a prose autocomplete engine for a rich text editor.
Given plain text before and after the cursor, output only the continuation: the words that should appear next if the author kept writing.

Rules:
- Plain text only. No markdown fences, no commentary.
- Do not repeat or quote text that already appears before the cursor.
- Prefer continuing the current sentence; add at most one short sentence unless the context clearly calls for more.
- If the cursor is mid-word, complete that word first, then continue only if it reads naturally.
- If nothing sensible can be suggested, return an empty string.`,
    stopWhen: stepCountIs(1),
    maxOutputTokens: llm.maxOutputTokens,
    ...(openAiModelSupportsTemperature(llm.model) ? { temperature: llm.temperature } : {}),
  });

  const { text } = await agent.generate({
    abortSignal,
    prompt: `TEXT_BEFORE_CURSOR:
"""
${input.before}
"""

TEXT_AFTER_CURSOR (context only; do not repeat it):
"""
${input.after}
"""

Return only the new completion text to insert at the cursor.`,
  });

  return (text ?? '').replace(/^\s+/, '').trimEnd();
}
