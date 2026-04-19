export type ScribeAutocompleteResult =
  | { ok: true; text: string }
  | { ok: false; error: string }
  | { ok: false; cancelled: true };

/** Persisted in the main process (includes secrets). */
export type ScribeStoredSettings = {
  openaiApiKey?: string;
  model: string;
  autocompleteEnabled: boolean;
  autocompleteDebounceMs: number;
  autocompleteTemperature: number;
  autocompleteMaxOutputTokens: number;
};

/** Safe to send to the renderer. */
export type ScribeSettingsPublic = {
  hasStoredOpenaiApiKey: boolean;
  envOpenaiApiKeyPresent: boolean;
  model: string;
  autocompleteEnabled: boolean;
  autocompleteDebounceMs: number;
  autocompleteTemperature: number;
  autocompleteMaxOutputTokens: number;
};

/**
 * `openaiApiKey`: omit to leave unchanged; empty string clears the stored key (falls back to env).
 */
export type ScribeSetSettingsInput = {
  openaiApiKey?: string;
  model?: string;
  autocompleteEnabled?: boolean;
  autocompleteDebounceMs?: number;
  autocompleteTemperature?: number;
  autocompleteMaxOutputTokens?: number;
};
