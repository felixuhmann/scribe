import { useCallback, useEffect, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

import { ANTHROPIC_MODELS, KNOWN_CHAT_MODEL_IDS, OPENAI_MODELS } from '@/lib/chat-models';
import type { ScribeSetSettingsInput, ScribeSettingsPublic } from '@/src/scribe-ipc-types';

function openAiKeyStatusLine(settings: ScribeSettingsPublic | null): string {
  if (!settings) return '';
  if (settings.hasStoredOpenaiApiKey) return 'Using the OpenAI key saved in Scribe settings.';
  if (settings.envOpenaiApiKeyPresent) return 'Using OPENAI_API_KEY from your environment (.env).';
  return 'No OpenAI key in settings or .env. Add one below or set OPENAI_API_KEY in a .env file.';
}

function anthropicKeyStatusLine(settings: ScribeSettingsPublic | null): string {
  if (!settings) return '';
  if (settings.hasStoredAnthropicApiKey) return 'Using the Anthropic key saved in Scribe settings.';
  if (settings.envAnthropicApiKeyPresent) return 'Using ANTHROPIC_API_KEY from your environment (.env).';
  return 'No Anthropic key in settings or .env. Add one below or set ANTHROPIC_API_KEY when using Claude models.';
}

export function SettingsDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const baseId = useId();
  const openaiApiKeyId = `${baseId}-openai-api-key`;
  const anthropicApiKeyId = `${baseId}-anthropic-api-key`;
  const modelId = `${baseId}-model`;
  const debounceId = `${baseId}-debounce`;
  const tempId = `${baseId}-temperature`;
  const tokensId = `${baseId}-tokens`;

  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<ScribeSettingsPublic | null>(null);
  const [openaiApiKeyInput, setOpenaiApiKeyInput] = useState('');
  const [anthropicApiKeyInput, setAnthropicApiKeyInput] = useState('');
  const [model, setModel] = useState('gpt-5.4-mini');
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(true);
  const [debounceMs, setDebounceMs] = useState(420);
  const [temperature, setTemperature] = useState(0.15);
  const [maxOutputTokens, setMaxOutputTokens] = useState(160);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const api = window.scribe?.getSettings;
    if (!api) {
      setError('Settings are unavailable outside the Scribe desktop app.');
      setLoaded(true);
      return;
    }
    setLoaded(false);
    setError(null);
    void api().then((s) => {
      setSettings(s);
      setModel(s.model);
      setAutocompleteEnabled(s.autocompleteEnabled);
      setDebounceMs(s.autocompleteDebounceMs);
      setTemperature(s.autocompleteTemperature);
      setMaxOutputTokens(s.autocompleteMaxOutputTokens);
      setOpenaiApiKeyInput('');
      setAnthropicApiKeyInput('');
      setLoaded(true);
    });
  }, [open]);

  const save = useCallback(async () => {
    const api = window.scribe?.setSettings;
    if (!api) {
      setError('Saving settings requires the Scribe desktop app.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const patch: ScribeSetSettingsInput = {
        model,
        autocompleteEnabled,
        autocompleteDebounceMs: debounceMs,
        autocompleteTemperature: temperature,
        autocompleteMaxOutputTokens: maxOutputTokens,
      };
      if (openaiApiKeyInput.trim() !== '') {
        patch.openaiApiKey = openaiApiKeyInput.trim();
      }
      if (anthropicApiKeyInput.trim() !== '') {
        patch.anthropicApiKey = anthropicApiKeyInput.trim();
      }
      const next = await api(patch);
      setSettings(next);
      setOpenaiApiKeyInput('');
      setAnthropicApiKeyInput('');
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }, [
    openaiApiKeyInput,
    anthropicApiKeyInput,
    autocompleteEnabled,
    debounceMs,
    maxOutputTokens,
    model,
    onOpenChange,
    onSaved,
    temperature,
  ]);

  const clearStoredOpenaiKey = useCallback(async () => {
    const api = window.scribe?.setSettings;
    if (!api) return;
    setSaving(true);
    setError(null);
    try {
      const next = await api({ openaiApiKey: '' });
      setSettings(next);
      setOpenaiApiKeyInput('');
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear the OpenAI API key.');
    } finally {
      setSaving(false);
    }
  }, [onSaved]);

  const clearStoredAnthropicKey = useCallback(async () => {
    const api = window.scribe?.setSettings;
    if (!api) return;
    setSaving(true);
    setError(null);
    try {
      const next = await api({ anthropicApiKey: '' });
      setSettings(next);
      setAnthropicApiKeyInput('');
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear the Anthropic API key.');
    } finally {
      setSaving(false);
    }
  }, [onSaved]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Autocomplete and quick actions run in the desktop app using your API keys. Keys are stored locally in your
            user data folder, not synced.
          </DialogDescription>
        </DialogHeader>

        {!loaded ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <div className="flex max-h-[min(70vh,32rem)] flex-col gap-4 overflow-y-auto pr-1">
            {error ? <p className="text-destructive text-sm">{error}</p> : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor={openaiApiKeyId}>OpenAI API key</Label>
              <Input
                id={openaiApiKeyId}
                type="password"
                autoComplete="off"
                value={openaiApiKeyInput}
                onChange={(e) => setOpenaiApiKeyInput(e.target.value)}
                placeholder={
                  settings?.hasStoredOpenaiApiKey ? '•••••••• (enter a new key to replace)' : 'sk-…'
                }
              />
              <p className="text-muted-foreground text-xs">{openAiKeyStatusLine(settings)}</p>
              {settings?.hasStoredOpenaiApiKey ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => void clearStoredOpenaiKey()}
                  disabled={saving}
                >
                  Remove stored OpenAI key
                </Button>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={anthropicApiKeyId}>Anthropic API key</Label>
              <Input
                id={anthropicApiKeyId}
                type="password"
                autoComplete="off"
                value={anthropicApiKeyInput}
                onChange={(e) => setAnthropicApiKeyInput(e.target.value)}
                placeholder={
                  settings?.hasStoredAnthropicApiKey ? '•••••••• (enter a new key to replace)' : 'sk-ant-…'
                }
              />
              <p className="text-muted-foreground text-xs">{anthropicKeyStatusLine(settings)}</p>
              {settings?.hasStoredAnthropicApiKey ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => void clearStoredAnthropicKey()}
                  disabled={saving}
                >
                  Remove stored Anthropic key
                </Button>
              ) : null}
            </div>

            <Separator />

            <div className="flex flex-col gap-2">
              <Label htmlFor={modelId}>Model</Label>
              <select
                id={modelId}
                className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                {!KNOWN_CHAT_MODEL_IDS.has(model) ? <option value={model}>{model}</option> : null}
                <optgroup label="OpenAI">
                  {OPENAI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Anthropic">
                  {ANTHROPIC_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              </select>
              <p className="text-muted-foreground text-xs">
                Pick a model your account can use. OpenAI models need an OpenAI key; Claude models need an Anthropic
                key. The same choice is used for document chat, tab autocomplete, and quick edit.
              </p>
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Tab autocomplete</span>
                <span className="text-muted-foreground text-xs">Ghost suggestions while you type (Tab accepts).</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autocompleteEnabled}
                onClick={() => setAutocompleteEnabled((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border border-transparent transition-colors ${
                  autocompleteEnabled ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`pointer-events-none block size-5 translate-y-0.5 rounded-full bg-background shadow-sm ring-1 ring-foreground/10 transition-transform ${
                    autocompleteEnabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor={debounceId}>Debounce (ms)</Label>
                <Input
                  id={debounceId}
                  type="number"
                  inputMode="numeric"
                  min={120}
                  max={2000}
                  step={20}
                  value={debounceMs}
                  onChange={(e) => setDebounceMs(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={tempId}>Temperature</Label>
                <Input
                  id={tempId}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={1}
                  step={0.05}
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={tokensId}>Max tokens</Label>
                <Input
                  id={tokensId}
                  type="number"
                  inputMode="numeric"
                  min={32}
                  max={512}
                  step={16}
                  value={maxOutputTokens}
                  onChange={(e) => setMaxOutputTokens(Number(e.target.value))}
                />
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              Lower temperature makes completions steadier; higher max tokens allows longer ghost text (and higher cost).
            </p>
          </div>
        )}

        <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={!loaded || saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
