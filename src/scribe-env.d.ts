import type {
  DocumentChatBundle,
  OpenHtmlDocumentResult,
  SaveHtmlAsResult,
  SaveHtmlToPathResult,
  ScribeAutocompleteResult,
  ScribeSetSettingsInput,
  ScribeSettingsPublic,
} from './scribe-ipc-types';

export {};

declare global {
  interface Window {
    scribe?: {
      autocompleteSuggest: (input: { before: string; after: string }) => Promise<ScribeAutocompleteResult>;
      getSettings: () => Promise<ScribeSettingsPublic>;
      setSettings: (patch: ScribeSetSettingsInput) => Promise<ScribeSettingsPublic>;
      getDocumentChatBundle: (documentKey: string) => Promise<DocumentChatBundle>;
      saveDocumentChatBundle: (documentKey: string, bundle: DocumentChatBundle) => Promise<void>;
      openHtmlDocument: () => Promise<OpenHtmlDocumentResult>;
      saveHtmlToPath: (filePath: string, htmlBody: string) => Promise<SaveHtmlToPathResult>;
      saveHtmlAs: (input: { htmlBody: string; defaultPath?: string }) => Promise<SaveHtmlAsResult>;
      documentChatStream: (params: {
        messages: unknown[];
        documentHtml: string;
        onChunk: (chunk: unknown) => void;
        onFinished: (error?: Error) => void;
      }) => () => void;
    };
  }
}
