import { ANTHROPIC_MODELS, KNOWN_CHAT_MODEL_IDS, OPENAI_MODELS } from '@/lib/llm';

/**
 * Dropdown of known chat/autocomplete models, with an escape hatch that
 * renders an unknown persisted id so stale settings don't silently drop it.
 * Used by both the document chat composer and the Settings dialog.
 */
export function ChatModelSelect({
  id,
  value,
  onChange,
  disabled,
  className,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      className={className}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {!KNOWN_CHAT_MODEL_IDS.has(value) ? <option value={value}>{value}</option> : null}
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
  );
}
