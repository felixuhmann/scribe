export type ScribeAutocompleteResult =
  | { ok: true; text: string }
  | { ok: false; error: string }
  | { ok: false; cancelled: true };

export type ScribeQuickEditResult =
  | { ok: true; text: string }
  | { ok: false; error: string }
  | { ok: false; cancelled: true };

/** Persisted in the main process (includes secrets). */
export type ScribeStoredSettings = {
  openaiApiKey?: string;
  anthropicApiKey?: string;
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
  hasStoredAnthropicApiKey: boolean;
  envAnthropicApiKeyPresent: boolean;
  model: string;
  autocompleteEnabled: boolean;
  autocompleteDebounceMs: number;
  autocompleteTemperature: number;
  autocompleteMaxOutputTokens: number;
};

/**
 * `openaiApiKey` / `anthropicApiKey`: omit to leave unchanged; empty string clears the stored key (falls back to env).
 */
export type ScribeSetSettingsInput = {
  openaiApiKey?: string;
  anthropicApiKey?: string;
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

/** Partial update for one chat session (disk merge from renderer, e.g. unmount while another doc is open). */
export type DocumentChatSessionMergePatch = {
  messages?: unknown[];
  title?: string;
  updatedAt?: number;
  lastAgentDocumentHtml?: string;
};

export type OpenDocumentResult =
  | { ok: true; path: string; name: string; text: string; format: 'html' | 'markdown' }
  | { ok: false; cancelled?: true; error?: string };

/** Recursive tree of folders (only if they contain supported files) and supported document files. */
export type ExplorerFolderEntry =
  | {
      kind: 'dir';
      name: string;
      path: string;
      mtimeMs: number;
      children: ExplorerFolderEntry[];
    }
  | {
      kind: 'file';
      name: string;
      path: string;
      mtimeMs: number;
      sizeBytes: number;
    };

export type ListExplorerFolderResult =
  | { ok: true; rootPath: string; entries: ExplorerFolderEntry[] }
  | { ok: false; error: string };

export type RevealInOSResult = { ok: true } | { ok: false; error: string };

export type CreateFileInFolderResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

export type CreateFolderInFolderResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

export type TrashItemResult = { ok: true } | { ok: false; error: string };

export type SaveHtmlToPathResult = { ok: true } | { ok: false; error: string };

export type SaveHtmlAsResult =
  | { ok: true; path: string }
  | { ok: false; cancelled?: true; error?: string };

export type SaveMarkdownToPathResult = { ok: true } | { ok: false; error: string };

export type SaveMarkdownAsResult =
  | { ok: true; path: string }
  | { ok: false; cancelled?: true; error?: string };

export type ExportPdfResult =
  | { ok: true; path: string }
  | { ok: false; cancelled?: true; error?: string };

/** Rename a file on disk to a new basename inside the same directory. */
export type RenameFileResult =
  | { ok: true; path: string }
  | { ok: false; error: string };
