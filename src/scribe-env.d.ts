import type { ScribeAutocompleteResult, ScribeSetSettingsInput, ScribeSettingsPublic } from './scribe-ipc-types';

export {};

declare global {
  interface Window {
    scribe?: {
      autocompleteSuggest: (input: { before: string; after: string }) => Promise<ScribeAutocompleteResult>;
      getSettings: () => Promise<ScribeSettingsPublic>;
      setSettings: (patch: ScribeSetSettingsInput) => Promise<ScribeSettingsPublic>;
      documentChatStream: (params: {
        messages: unknown[];
        documentHtml: string;
        onChunk: (chunk: unknown) => void;
        onFinished: (error?: Error) => void;
      }) => () => void;
    };
  }
}
