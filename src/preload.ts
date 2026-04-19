import { contextBridge, ipcRenderer } from 'electron';

import type {
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
