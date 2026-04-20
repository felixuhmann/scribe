import type {
  DocumentChatChunkPayload,
  DocumentChatStartPayload,
} from './ipc/channels';
import type {
  DocumentChatBundle,
  DocumentChatSessionMergePatch,
  ExportPdfResult,
  ListExplorerFolderResult,
  OpenDocumentResult,
  RenameFileResult,
  SaveHtmlAsResult,
  SaveHtmlToPathResult,
  SaveMarkdownAsResult,
  SaveMarkdownToPathResult,
  ScribeAutocompleteResult,
  ScribeQuickEditResult,
  ScribeSetSettingsInput,
  ScribeSettingsPublic,
} from './scribe-ipc-types';

export {};

declare global {
  interface Window {
    scribe?: {
      autocompleteSuggest: (input: { before: string; after: string }) => Promise<ScribeAutocompleteResult>;
      quickEditSelection: (input: {
        selectedText: string;
        instruction: string;
      }) => Promise<ScribeQuickEditResult>;
      getSettings: () => Promise<ScribeSettingsPublic>;
      setSettings: (patch: ScribeSetSettingsInput) => Promise<ScribeSettingsPublic>;
      getDocumentChatBundle: (documentKey: string) => Promise<DocumentChatBundle>;
      saveDocumentChatBundle: (documentKey: string, bundle: DocumentChatBundle) => Promise<void>;
      mergeDocumentChatSession: (
        documentKey: string,
        sessionId: string,
        patch: DocumentChatSessionMergePatch,
      ) => Promise<void>;
      openDocument: () => Promise<OpenDocumentResult>;
      openDocumentAtPath: (filePath: string) => Promise<OpenDocumentResult>;
      listExplorerFolder: (rootPath: string) => Promise<ListExplorerFolderResult>;
      saveHtmlToPath: (filePath: string, htmlBody: string) => Promise<SaveHtmlToPathResult>;
      saveHtmlAs: (input: { htmlBody: string; defaultPath?: string }) => Promise<SaveHtmlAsResult>;
      saveMarkdownToPath: (filePath: string, markdown: string) => Promise<SaveMarkdownToPathResult>;
      saveMarkdownAs: (input: { markdown: string; defaultPath?: string }) => Promise<SaveMarkdownAsResult>;
      exportPdf: (input: { htmlBody: string; defaultPath?: string }) => Promise<ExportPdfResult>;
      renameFile: (filePath: string, newBasename: string) => Promise<RenameFileResult>;
      documentChatStream: (params: {
        messages: DocumentChatStartPayload['messages'];
        documentHtml: string;
        documentChangeSummary?: string;
        chatMode?: DocumentChatStartPayload['chatMode'];
        planRefinementRounds?: number;
        planDepthMode?: DocumentChatStartPayload['planDepthMode'];
        onChunk: (chunk: DocumentChatChunkPayload['chunk']) => void;
        onFinished: (error?: Error) => void;
      }) => () => void;
    };
  }
}
