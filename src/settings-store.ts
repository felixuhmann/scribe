import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { ScribeSettingsPublic, ScribeSetSettingsInput, ScribeStoredSettings } from './scribe-ipc-types';

const FILE_NAME = 'scribe-settings.json';

const defaults: ScribeStoredSettings = {
  model: 'gpt-5.4-mini',
  autocompleteEnabled: true,
  autocompleteDebounceMs: 420,
  autocompleteTemperature: 0.15,
  autocompleteMaxOutputTokens: 160,
};

function settingsPath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampNumber(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function normalizeSettings(s: ScribeStoredSettings): ScribeStoredSettings {
  const next: ScribeStoredSettings = {
    model: s.model?.trim() || defaults.model,
    autocompleteEnabled: Boolean(s.autocompleteEnabled),
    autocompleteDebounceMs: clampInt(s.autocompleteDebounceMs, 120, 2000),
    autocompleteTemperature: clampNumber(s.autocompleteTemperature, 0, 1),
    autocompleteMaxOutputTokens: clampInt(s.autocompleteMaxOutputTokens, 32, 512),
  };
  const key = s.openaiApiKey?.trim();
  if (key) {
    next.openaiApiKey = key;
  }
  return next;
}

export async function readStoredSettings(): Promise<ScribeStoredSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<ScribeStoredSettings>;
    const base: ScribeStoredSettings = {
      ...defaults,
      model: typeof parsed.model === 'string' && parsed.model.trim() !== '' ? parsed.model.trim() : defaults.model,
      autocompleteEnabled:
        typeof parsed.autocompleteEnabled === 'boolean' ? parsed.autocompleteEnabled : defaults.autocompleteEnabled,
      autocompleteDebounceMs:
        typeof parsed.autocompleteDebounceMs === 'number' ? parsed.autocompleteDebounceMs : defaults.autocompleteDebounceMs,
      autocompleteTemperature:
        typeof parsed.autocompleteTemperature === 'number'
          ? parsed.autocompleteTemperature
          : defaults.autocompleteTemperature,
      autocompleteMaxOutputTokens:
        typeof parsed.autocompleteMaxOutputTokens === 'number'
          ? parsed.autocompleteMaxOutputTokens
          : defaults.autocompleteMaxOutputTokens,
    };
    if (typeof parsed.openaiApiKey === 'string' && parsed.openaiApiKey.trim() !== '') {
      base.openaiApiKey = parsed.openaiApiKey.trim();
    }
    return normalizeSettings(base);
  } catch {
    return normalizeSettings({ ...defaults });
  }
}

export async function writeStoredSettings(next: ScribeStoredSettings): Promise<void> {
  const normalized = normalizeSettings(next);
  const dir = path.dirname(settingsPath());
  await fs.mkdir(dir, { recursive: true });
  const { openaiApiKey, ...rest } = normalized;
  const payload: Record<string, unknown> = { ...rest };
  if (openaiApiKey) {
    payload.openaiApiKey = openaiApiKey;
  }
  await fs.writeFile(settingsPath(), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function getPublicSettings(stored: ScribeStoredSettings): ScribeSettingsPublic {
  const envOpenaiApiKeyPresent = Boolean(process.env.OPENAI_API_KEY?.trim());
  return {
    hasStoredOpenaiApiKey: Boolean(stored.openaiApiKey?.trim()),
    envOpenaiApiKeyPresent,
    model: stored.model,
    autocompleteEnabled: stored.autocompleteEnabled,
    autocompleteDebounceMs: stored.autocompleteDebounceMs,
    autocompleteTemperature: stored.autocompleteTemperature,
    autocompleteMaxOutputTokens: stored.autocompleteMaxOutputTokens,
  };
}

export async function applySettingsPatch(
  current: ScribeStoredSettings,
  patch: ScribeSetSettingsInput,
): Promise<ScribeStoredSettings> {
  let openaiApiKey = current.openaiApiKey;
  if (patch.openaiApiKey !== undefined) {
    const v = patch.openaiApiKey.trim();
    openaiApiKey = v === '' ? undefined : v;
  }

  const next: ScribeStoredSettings = normalizeSettings({
    ...current,
    openaiApiKey,
    model: patch.model !== undefined ? patch.model : current.model,
    autocompleteEnabled: patch.autocompleteEnabled ?? current.autocompleteEnabled,
    autocompleteDebounceMs: patch.autocompleteDebounceMs ?? current.autocompleteDebounceMs,
    autocompleteTemperature: patch.autocompleteTemperature ?? current.autocompleteTemperature,
    autocompleteMaxOutputTokens: patch.autocompleteMaxOutputTokens ?? current.autocompleteMaxOutputTokens,
  });

  await writeStoredSettings(next);
  return next;
}

export function resolveOpenAiApiKey(stored: ScribeStoredSettings): string | null {
  const fromStore = stored.openaiApiKey?.trim();
  if (fromStore) return fromStore;
  const fromEnv = process.env.OPENAI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  return null;
}
