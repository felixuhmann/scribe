import { createOpenAI } from '@ai-sdk/openai';
import { stepCountIs, ToolLoopAgent } from 'ai';

export async function runAutocomplete(
  apiKey: string,
  input: { before: string; after: string },
  abortSignal?: AbortSignal,
): Promise<string> {
  const openai = createOpenAI({ apiKey });
  const agent = new ToolLoopAgent({
    model: openai('gpt-4o-mini'),
    instructions: `You are a prose autocomplete engine for a rich text editor.
Given plain text before and after the cursor, output only the continuation: the words that should appear next if the author kept writing.

Rules:
- Plain text only. No markdown fences, no commentary.
- Do not repeat or quote text that already appears before the cursor.
- Prefer continuing the current sentence; add at most one short sentence unless the context clearly calls for more.
- If the cursor is mid-word, complete that word first, then continue only if it reads naturally.
- If nothing sensible can be suggested, return an empty string.`,
    stopWhen: stepCountIs(1),
    maxOutputTokens: 160,
    temperature: 0.15,
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
