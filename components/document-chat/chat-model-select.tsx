import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  size = 'default',
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  size?: 'sm' | 'default';
}) {
  const isKnown = KNOWN_CHAT_MODEL_IDS.has(value);
  return (
    <Select value={value} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={ariaLabel} size={size} className={cn(className)}>
        <SelectValue placeholder="Model" />
      </SelectTrigger>
      <SelectContent>
        {!isKnown ? (
          <SelectGroup>
            <SelectLabel>Saved</SelectLabel>
            <SelectItem value={value}>{value}</SelectItem>
          </SelectGroup>
        ) : null}
        <SelectGroup>
          <SelectLabel>OpenAI</SelectLabel>
          {OPENAI_MODELS.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Anthropic</SelectLabel>
          {ANTHROPIC_MODELS.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
