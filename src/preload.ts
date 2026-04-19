import { contextBridge, ipcRenderer } from 'electron';

import type { ScribeAutocompleteResult } from './scribe-ipc-types';

contextBridge.exposeInMainWorld('scribe', {
  autocompleteSuggest: (input: { before: string; after: string }): Promise<ScribeAutocompleteResult> =>
    ipcRenderer.invoke('scribe:autocomplete', input),
});
