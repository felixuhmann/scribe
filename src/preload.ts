import { contextBridge, ipcRenderer } from 'electron';

import type {
  DocumentChatBundle,
  OpenHtmlDocumentResult,
  SaveHtmlAsResult,
  SaveHtmlToPathResult,
  ScribeAutocompleteResult,
  ScribeSetSettingsInput,
  ScribeSettingsPublic,
} from './scribe-ipc-types';

contextBridge.exposeInMainWorld('scribe', {
  autocompleteSuggest: (input: { before: string; after: string }): Promise<ScribeAutocompleteResult> =>
    ipcRenderer.invoke('scribe:autocomplete', input),
  getSettings: (): Promise<ScribeSettingsPublic> => ipcRenderer.invoke('scribe:getSettings'),
  setSettings: (patch: ScribeSetSettingsInput): Promise<ScribeSettingsPublic> =>
    ipcRenderer.invoke('scribe:setSettings', patch),
  getDocumentChatBundle: (documentKey: string): Promise<DocumentChatBundle> =>
    ipcRenderer.invoke('scribe:getDocumentChatBundle', documentKey),
  saveDocumentChatBundle: (documentKey: string, bundle: DocumentChatBundle): Promise<void> =>
    ipcRenderer.invoke('scribe:saveDocumentChatBundle', { documentKey, bundle }),
  openHtmlDocument: (): Promise<OpenHtmlDocumentResult> => ipcRenderer.invoke('scribe:openHtmlDocument'),
  saveHtmlToPath: (filePath: string, htmlBody: string): Promise<SaveHtmlToPathResult> =>
    ipcRenderer.invoke('scribe:saveHtmlToPath', { path: filePath, htmlBody }),
  saveHtmlAs: (input: { htmlBody: string; defaultPath?: string }): Promise<SaveHtmlAsResult> =>
    ipcRenderer.invoke('scribe:saveHtmlAs', input),
  documentChatStream: (params: {
    messages: unknown[];
    documentHtml: string;
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
    });

    return () => {
      ipcRenderer.send('scribe:documentChat:abort', { id });
    };
  },
});
