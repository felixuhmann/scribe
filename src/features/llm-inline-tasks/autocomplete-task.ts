import { stepCountIs, ToolLoopAgent } from 'ai';

import { buildLlmCall } from '../../../lib/llm';
import { channels } from '../../ipc/channels';
import type { LlmInlineTask } from './inline-task-ipc';

export const autocompleteTask: LlmInlineTask<{ before: string; after: string }> = {
  channel: channels.autocomplete,
  defaultErrorMessage: 'Autocomplete failed',
  preflight: (_input, stored) => {
    if (!stored.autocompleteEnabled) {
      return 'Autocomplete is turned off in Settings.';
    }
    return null;
  },
  run: async (input, { apiKey, signal, stored }) => {
    const { model, temperatureOption } = buildLlmCall({
      apiKey,
      modelId: stored.model,
      temperature: stored.autocompleteTemperature,
    });
    const agent = new ToolLoopAgent({
      model,
      instructions: `You are a prose autocomplete engine for a rich text editor.
Given plain text before and after the cursor, output only the continuation: the words that should appear next if the author kept writing.

Rules:
- Plain text only. No markdown fences, no commentary.
- Do not repeat or quote text that already appears before the cursor.
- Prefer continuing the current sentence; add at most one short sentence unless the context clearly calls for more.
- If the cursor is mid-word, complete that word first, then continue only if it reads naturally.
- If nothing sensible can be suggested, return an empty string.`,
      stopWhen: stepCountIs(1),
      maxOutputTokens: stored.autocompleteMaxOutputTokens,
      ...temperatureOption,
    });

    const { text } = await agent.generate({
      abortSignal: signal,
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
  },
};
