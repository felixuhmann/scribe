import { generateText } from 'ai';

import { buildLlmCall } from '../../../lib/llm';
import { channels } from '../../ipc/channels';
import type { LlmInlineTask } from './inline-task-ipc';

const QUICK_EDIT_MAX_OUTPUT_TOKENS_CAP = 4096;
const QUICK_EDIT_MAX_OUTPUT_TOKENS_MIN = 256;

export const quickEditTask: LlmInlineTask<{ selectedText: string; instruction: string }> = {
  channel: channels.quickEditSelection,
  defaultErrorMessage: 'Quick edit failed',
  preflight: (input) => {
    if (!input.instruction.trim()) {
      return 'Describe what you want to change.';
    }
    if (!input.selectedText.trim()) {
      return 'Select some text to edit.';
    }
    return null;
  },
  run: async (input, { apiKey, signal, stored }) => {
    const { model, temperatureOption } = buildLlmCall({
      apiKey,
      modelId: stored.model,
      temperature: 0.25,
    });
    const maxOutputTokens = Math.min(
      QUICK_EDIT_MAX_OUTPUT_TOKENS_CAP,
      Math.max(QUICK_EDIT_MAX_OUTPUT_TOKENS_MIN, stored.autocompleteMaxOutputTokens * 8),
    );
    const { text } = await generateText({
      model,
      abortSignal: signal,
      maxOutputTokens,
      ...temperatureOption,
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
${input.instruction.trim()}`,
    });

    return (text ?? '').trim();
  },
};
