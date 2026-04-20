import { channels, type InvokeChannel } from '../../ipc/channels';
import { registerInvoke } from '../../ipc/main-register';
import { providerForModel } from '../../../lib/llm';
import {
  missingApiKeyErrorMessage,
  readStoredSettings,
  resolveApiKeyForProvider,
} from '../settings/settings-store';
import type { ScribeStoredSettings } from '../../scribe-ipc-types';
import { autocompleteTask } from './autocomplete-task';
import { quickEditTask } from './quick-edit-task';

/**
 * Result shape for a one-shot LLM inline task. All tasks return text on
 * success, a human-readable error string, or a `cancelled` flag when an
 * in-flight call was aborted by a newer invocation.
 */
export type LlmInlineTaskResult =
  | { ok: true; text: string }
  | { ok: false; error: string }
  | { ok: false; cancelled: true };

export type LlmInlineTaskContext = {
  apiKey: string;
  signal: AbortSignal;
  stored: ScribeStoredSettings;
};

/**
 * Declarative descriptor for a one-shot LLM call surfaced as an IPC invoke
 * channel. The shared handler owns aborting older calls, reading settings,
 * resolving the API key, producing uniform error text, and translating
 * AbortError into `{ cancelled: true }`. Tasks supply only preflight checks
 * and the prompt + AI SDK call.
 */
export type LlmInlineTask<TIn> = {
  channel: InvokeChannel<TIn, LlmInlineTaskResult>;
  /**
   * Optional preflight. Return an error message to short-circuit without
   * calling the LLM, or `null` to proceed. Runs after the API key check.
   */
  preflight?: (input: TIn, stored: ScribeStoredSettings) => string | null;
  run: (input: TIn, ctx: LlmInlineTaskContext) => Promise<string>;
  defaultErrorMessage: string;
};

/** One abort controller per channel — each new invocation cancels the previous one. */
const abortsByChannel = new Map<string, AbortController>();

function registerLlmInlineTask<TIn>(task: LlmInlineTask<TIn>): void {
  registerInvoke(task.channel, async (input): Promise<LlmInlineTaskResult> => {
    abortsByChannel.get(task.channel.name)?.abort();
    const controller = new AbortController();
    abortsByChannel.set(task.channel.name, controller);
    const { signal } = controller;

    const stored = await readStoredSettings();
    const provider = providerForModel(stored.model);
    const apiKey = resolveApiKeyForProvider(stored, provider);
    if (!apiKey) {
      return { ok: false, error: missingApiKeyErrorMessage(provider) };
    }

    const preflightError = task.preflight?.(input, stored) ?? null;
    if (preflightError) {
      return { ok: false, error: preflightError };
    }

    try {
      const text = await task.run(input, { apiKey, signal, stored });
      if (signal.aborted) {
        return { ok: false, cancelled: true };
      }
      return { ok: true, text };
    } catch (err) {
      if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        return { ok: false, cancelled: true };
      }
      const message = err instanceof Error ? err.message : task.defaultErrorMessage;
      return { ok: false, error: message };
    }
  });
}

export function registerLlmInlineTasks(): void {
  registerLlmInlineTask(autocompleteTask);
  registerLlmInlineTask(quickEditTask);
}

// Re-export so consumers can reference descriptors if needed.
export { autocompleteTask, quickEditTask };
// The channels reference is a convenience for readers: this handler owns both.
export const HANDLED_CHANNELS = [channels.autocomplete, channels.quickEditSelection] as const;
