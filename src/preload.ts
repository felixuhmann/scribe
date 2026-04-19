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
});
