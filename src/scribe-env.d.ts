import type {
  DocumentChatBundle,
  ExportPdfResult,
  OpenDocumentResult,
  SaveHtmlAsResult,
  SaveHtmlToPathResult,
  SaveMarkdownAsResult,
  SaveMarkdownToPathResult,
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
      openDocument: () => Promise<OpenDocumentResult>;
      saveHtmlToPath: (filePath: string, htmlBody: string) => Promise<SaveHtmlToPathResult>;
      saveHtmlAs: (input: { htmlBody: string; defaultPath?: string }) => Promise<SaveHtmlAsResult>;
      saveMarkdownToPath: (filePath: string, markdown: string) => Promise<SaveMarkdownToPathResult>;
      saveMarkdownAs: (input: { markdown: string; defaultPath?: string }) => Promise<SaveMarkdownAsResult>;
      exportPdf: (input: { htmlBody: string; defaultPath?: string }) => Promise<ExportPdfResult>;
      documentChatStream: (params: {
        messages: unknown[];
        documentHtml: string;
        documentChangeSummary?: string;
        onChunk: (chunk: unknown) => void;
        onFinished: (error?: Error) => void;
      }) => () => void;
    };
  }
}
