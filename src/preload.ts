import { contextBridge, ipcRenderer } from 'electron';

import {
  channels,
  type DocumentChatChunkPayload,
  type DocumentChatEndPayload,
  type DocumentChatStartPayload,
} from './ipc/channels';
import type {
  CreateFileInFolderResult,
  CreateFolderInFolderResult,
  DocumentChatBundle,
  DocumentChatSessionMergePatch,
  ExportPdfResult,
  ListExplorerFolderResult,
  OpenDocumentResult,
  RenameFileResult,
  RevealInOSResult,
  SaveHtmlAsResult,
  SaveHtmlToPathResult,
  SaveMarkdownAsResult,
  SaveMarkdownToPathResult,
  ScribeAutocompleteResult,
  ScribeQuickEditResult,
  ScribeSetSettingsInput,
  ScribeSettingsPublic,
  TrashItemResult,
} from './scribe-ipc-types';

contextBridge.exposeInMainWorld('scribe', {
  autocompleteSuggest: (input: { before: string; after: string }): Promise<ScribeAutocompleteResult> =>
    ipcRenderer.invoke(channels.autocomplete.name, input),
  quickEditSelection: (input: {
    selectedText: string;
    instruction: string;
  }): Promise<ScribeQuickEditResult> => ipcRenderer.invoke(channels.quickEditSelection.name, input),
  getSettings: (): Promise<ScribeSettingsPublic> => ipcRenderer.invoke(channels.getSettings.name),
  setSettings: (patch: ScribeSetSettingsInput): Promise<ScribeSettingsPublic> =>
    ipcRenderer.invoke(channels.setSettings.name, patch),
  getDocumentChatBundle: (documentKey: string): Promise<DocumentChatBundle> =>
    ipcRenderer.invoke(channels.getDocumentChatBundle.name, documentKey),
  saveDocumentChatBundle: (documentKey: string, bundle: DocumentChatBundle): Promise<void> =>
    ipcRenderer.invoke(channels.saveDocumentChatBundle.name, { documentKey, bundle }),
  mergeDocumentChatSession: (
    documentKey: string,
    sessionId: string,
    patch: DocumentChatSessionMergePatch,
  ): Promise<void> =>
    ipcRenderer.invoke(channels.mergeDocumentChatSession.name, { documentKey, sessionId, patch }),
  openDocument: (): Promise<OpenDocumentResult> => ipcRenderer.invoke(channels.openDocument.name),
  openDocumentAtPath: (filePath: string): Promise<OpenDocumentResult> =>
    ipcRenderer.invoke(channels.openDocumentAtPath.name, { path: filePath }),
  listExplorerFolder: (rootPath: string): Promise<ListExplorerFolderResult> =>
    ipcRenderer.invoke(channels.listExplorerFolder.name, { rootPath }),
  saveHtmlToPath: (filePath: string, htmlBody: string): Promise<SaveHtmlToPathResult> =>
    ipcRenderer.invoke(channels.saveHtmlToPath.name, { path: filePath, htmlBody }),
  saveHtmlAs: (input: { htmlBody: string; defaultPath?: string }): Promise<SaveHtmlAsResult> =>
    ipcRenderer.invoke(channels.saveHtmlAs.name, input),
  saveMarkdownToPath: (filePath: string, markdown: string): Promise<SaveMarkdownToPathResult> =>
    ipcRenderer.invoke(channels.saveMarkdownToPath.name, { path: filePath, markdown }),
  saveMarkdownAs: (input: { markdown: string; defaultPath?: string }): Promise<SaveMarkdownAsResult> =>
    ipcRenderer.invoke(channels.saveMarkdownAs.name, input),
  exportPdf: (input: { htmlBody: string; defaultPath?: string }): Promise<ExportPdfResult> =>
    ipcRenderer.invoke(channels.exportPdf.name, input),
  renameFile: (filePath: string, newBasename: string): Promise<RenameFileResult> =>
    ipcRenderer.invoke(channels.renameFile.name, { path: filePath, newBasename }),
  revealInOS: (filePath: string): Promise<RevealInOSResult> =>
    ipcRenderer.invoke(channels.revealInOS.name, { path: filePath }),
  createFileInFolder: (parentDir: string, name: string): Promise<CreateFileInFolderResult> =>
    ipcRenderer.invoke(channels.createFileInFolder.name, { parentDir, name }),
  createFolderInFolder: (parentDir: string, name: string): Promise<CreateFolderInFolderResult> =>
    ipcRenderer.invoke(channels.createFolderInFolder.name, { parentDir, name }),
  trashItem: (filePath: string): Promise<TrashItemResult> =>
    ipcRenderer.invoke(channels.trashItem.name, { path: filePath }),
  subscribeExplorerFolder: (rootPath: string, onChanged: () => void): (() => void) => {
    const watchId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `watch-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    const listener = (_: unknown, payload: { watchId: string }) => {
      if (payload.watchId !== watchId) return;
      onChanged();
    };
    ipcRenderer.on(channels.explorerWatchChanged.name, listener);
    ipcRenderer.send(channels.explorerWatchStart.name, { watchId, rootPath });
    return () => {
      ipcRenderer.removeListener(channels.explorerWatchChanged.name, listener);
      ipcRenderer.send(channels.explorerWatchStop.name, { watchId });
    };
  },
  documentChatStream: (params: {
    messages: DocumentChatStartPayload['messages'];
    documentHtml: string;
    documentChangeSummary?: string;
    chatMode?: DocumentChatStartPayload['chatMode'];
    planRefinementRounds?: number;
    planDepthMode?: DocumentChatStartPayload['planDepthMode'];
    onChunk: (chunk: DocumentChatChunkPayload['chunk']) => void;
    onFinished: (error?: Error) => void;
  }): (() => void) => {
    const id = crypto.randomUUID();

    const onChunk = (_: unknown, payload: DocumentChatChunkPayload) => {
      if (payload.id !== id) return;
      params.onChunk(payload.chunk);
    };

    const onEnd = (_: unknown, payload: DocumentChatEndPayload) => {
      if (payload.id !== id) return;
      ipcRenderer.removeListener(channels.documentChatChunk.name, onChunk);
      ipcRenderer.removeListener(channels.documentChatEnd.name, onEnd);
      params.onFinished(payload.error ? new Error(payload.error) : undefined);
    };

    ipcRenderer.on(channels.documentChatChunk.name, onChunk);
    ipcRenderer.on(channels.documentChatEnd.name, onEnd);

    const startPayload: DocumentChatStartPayload = {
      id,
      messages: params.messages,
      documentHtml: params.documentHtml,
      documentChangeSummary: params.documentChangeSummary,
      chatMode: params.chatMode,
      planRefinementRounds: params.planRefinementRounds,
      planDepthMode: params.planDepthMode,
    };
    ipcRenderer.send(channels.documentChatStart.name, startPayload);

    return () => {
      ipcRenderer.send(channels.documentChatAbort.name, { id });
    };
  },
});
