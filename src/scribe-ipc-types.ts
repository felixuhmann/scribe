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

/** One chat thread for a document; messages are AI SDK UI messages (JSON-serializable). */
export type StoredChatSession = {
  id: string;
  title: string;
  messages: unknown[];
  updatedAt: number;
  /** When true, hidden from the main list until restored. */
  archived?: boolean;
  /** Editor HTML after the last completed assistant turn — used to diff user edits before the next message. */
  lastAgentDocumentHtml?: string;
};

export type DocumentChatBundle = {
  activeSessionId: string;
  sessions: StoredChatSession[];
};

export type OpenHtmlDocumentResult =
  | { ok: true; path: string; name: string; html: string }
  | { ok: false; cancelled?: true; error?: string };

export type SaveHtmlToPathResult = { ok: true } | { ok: false; error: string };

export type SaveHtmlAsResult =
  | { ok: true; path: string }
  | { ok: false; cancelled?: true; error?: string };
