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

import type { ScribeSetSettingsInput, ScribeSettingsPublic } from '@/src/scribe-ipc-types';

const OPENAI_MODELS = [
  { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
  { id: 'gpt-5.4', label: 'GPT-5.4' },
] as const;

function keyStatusLine(settings: ScribeSettingsPublic | null): string {
  if (!settings) return '';
  if (settings.hasStoredOpenaiApiKey) return 'Using the API key saved in Scribe settings.';
  if (settings.envOpenaiApiKeyPresent) return 'Using OPENAI_API_KEY from your environment (.env).';
  return 'No API key configured. Add one below or set OPENAI_API_KEY in a .env file.';
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
  const apiKeyId = `${baseId}-api-key`;
  const modelId = `${baseId}-model`;
  const debounceId = `${baseId}-debounce`;
  const tempId = `${baseId}-temperature`;
  const tokensId = `${baseId}-tokens`;

  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<ScribeSettingsPublic | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
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
      setApiKeyInput('');
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
      if (apiKeyInput.trim() !== '') {
        patch.openaiApiKey = apiKeyInput.trim();
      }
      const next = await api(patch);
      setSettings(next);
      setApiKeyInput('');
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }, [
    apiKeyInput,
    autocompleteEnabled,
    debounceMs,
    maxOutputTokens,
    model,
    onOpenChange,
    onSaved,
    temperature,
  ]);

  const clearStoredKey = useCallback(async () => {
    const api = window.scribe?.setSettings;
    if (!api) return;
    setSaving(true);
    setError(null);
    try {
      const next = await api({ openaiApiKey: '' });
      setSettings(next);
      setApiKeyInput('');
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear the API key.');
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
            Autocomplete runs in the desktop app using your OpenAI key. Keys are stored locally in your user data
            folder, not synced.
          </DialogDescription>
        </DialogHeader>

        {!loaded ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <div className="flex max-h-[min(70vh,32rem)] flex-col gap-4 overflow-y-auto pr-1">
            {error ? <p className="text-destructive text-sm">{error}</p> : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor={apiKeyId}>OpenAI API key</Label>
              <Input
                id={apiKeyId}
                type="password"
                autoComplete="off"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={
                  settings?.hasStoredOpenaiApiKey ? '•••••••• (enter a new key to replace)' : 'sk-…'
                }
              />
              <p className="text-muted-foreground text-xs">{keyStatusLine(settings)}</p>
              {settings?.hasStoredOpenaiApiKey ? (
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => void clearStoredKey()} disabled={saving}>
                  Remove stored key
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
                {!OPENAI_MODELS.some((m) => m.id === model) ? (
                  <option value={model}>{model}</option>
                ) : null}
                {OPENAI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                Pick a chat model you have access to on your OpenAI account. Pricing and quality vary by model.
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
