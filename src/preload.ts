import { contextBridge, ipcRenderer } from 'electron';

import type {
  DocumentChatBundle,
  DocumentChatSessionMergePatch,
  ExportPdfResult,
  ListExplorerFolderResult,
  OpenDocumentResult,
  SaveHtmlAsResult,
  SaveHtmlToPathResult,
  SaveMarkdownAsResult,
  SaveMarkdownToPathResult,
  ScribeAutocompleteResult,
  ScribeQuickEditResult,
  ScribeSetSettingsInput,
  ScribeSettingsPublic,
} from './scribe-ipc-types';

contextBridge.exposeInMainWorld('scribe', {
  autocompleteSuggest: (input: { before: string; after: string }): Promise<ScribeAutocompleteResult> =>
    ipcRenderer.invoke('scribe:autocomplete', input),
  quickEditSelection: (input: {
    selectedText: string;
    instruction: string;
  }): Promise<ScribeQuickEditResult> => ipcRenderer.invoke('scribe:quickEditSelection', input),
  getSettings: (): Promise<ScribeSettingsPublic> => ipcRenderer.invoke('scribe:getSettings'),
  setSettings: (patch: ScribeSetSettingsInput): Promise<ScribeSettingsPublic> =>
    ipcRenderer.invoke('scribe:setSettings', patch),
  getDocumentChatBundle: (documentKey: string): Promise<DocumentChatBundle> =>
    ipcRenderer.invoke('scribe:getDocumentChatBundle', documentKey),
  saveDocumentChatBundle: (documentKey: string, bundle: DocumentChatBundle): Promise<void> =>
    ipcRenderer.invoke('scribe:saveDocumentChatBundle', { documentKey, bundle }),
  mergeDocumentChatSession: (
    documentKey: string,
    sessionId: string,
    patch: DocumentChatSessionMergePatch,
  ): Promise<void> =>
    ipcRenderer.invoke('scribe:mergeDocumentChatSession', { documentKey, sessionId, patch }),
  openDocument: (): Promise<OpenDocumentResult> => ipcRenderer.invoke('scribe:openDocument'),
  openDocumentAtPath: (filePath: string): Promise<OpenDocumentResult> =>
    ipcRenderer.invoke('scribe:openDocumentAtPath', { path: filePath }),
  listExplorerFolder: (rootPath: string): Promise<ListExplorerFolderResult> =>
    ipcRenderer.invoke('scribe:listExplorerFolder', { rootPath }),
  saveHtmlToPath: (filePath: string, htmlBody: string): Promise<SaveHtmlToPathResult> =>
    ipcRenderer.invoke('scribe:saveHtmlToPath', { path: filePath, htmlBody }),
  saveHtmlAs: (input: { htmlBody: string; defaultPath?: string }): Promise<SaveHtmlAsResult> =>
    ipcRenderer.invoke('scribe:saveHtmlAs', input),
  saveMarkdownToPath: (filePath: string, markdown: string): Promise<SaveMarkdownToPathResult> =>
    ipcRenderer.invoke('scribe:saveMarkdownToPath', { path: filePath, markdown }),
  saveMarkdownAs: (input: { markdown: string; defaultPath?: string }): Promise<SaveMarkdownAsResult> =>
    ipcRenderer.invoke('scribe:saveMarkdownAs', input),
  exportPdf: (input: { htmlBody: string; defaultPath?: string }): Promise<ExportPdfResult> =>
    ipcRenderer.invoke('scribe:exportPdf', input),
  documentChatStream: (params: {
    messages: unknown[];
    documentHtml: string;
    documentChangeSummary?: string;
    chatMode?: 'edit' | 'plan';
    onChunk: (chunk: unknown) => void;
    onFinished: (error?: Error) => void;
  }): (() => void) => {
    const id = crypto.randomUUID();

    const onChunk = (
      _: unknown,
      payload: {
        id: string;
        chunk: unknown;
      },
    ) => {
      if (payload.id !== id) return;
      params.onChunk(payload.chunk);
    };

    const onEnd = (
      _: unknown,
      payload: {
        id: string;
        error?: string;
      },
    ) => {
      if (payload.id !== id) return;
      ipcRenderer.removeListener('scribe:documentChat:chunk', onChunk);
      ipcRenderer.removeListener('scribe:documentChat:end', onEnd);
      params.onFinished(payload.error ? new Error(payload.error) : undefined);
    };

    ipcRenderer.on('scribe:documentChat:chunk', onChunk);
    ipcRenderer.on('scribe:documentChat:end', onEnd);

    ipcRenderer.send('scribe:documentChat:start', {
      id,
      messages: params.messages,
      documentHtml: params.documentHtml,
      documentChangeSummary: params.documentChangeSummary,
      chatMode: params.chatMode,
    });

    return () => {
      ipcRenderer.send('scribe:documentChat:abort', { id });
    };
  },
});
