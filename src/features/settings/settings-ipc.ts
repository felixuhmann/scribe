import { channels } from '../../ipc/channels';
import { registerInvoke } from '../../ipc/main-register';
import { applySettingsPatch, getPublicSettings, readStoredSettings } from './settings-store';

export function registerSettingsIpc(): void {
  registerInvoke(channels.getSettings, async () => {
    const stored = await readStoredSettings();
    return getPublicSettings(stored);
  });

  registerInvoke(channels.setSettings, async (patch) => {
    const current = await readStoredSettings();
    const next = await applySettingsPatch(current, patch);
    return getPublicSettings(next);
  });
}
