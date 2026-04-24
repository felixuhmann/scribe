import { SearchIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

type SearchInputProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Called when the user presses ArrowDown — hands focus off to the tree. */
  onArrowDown?: () => void;
};

const DEBOUNCE_MS = 80;

export function ExplorerSearchInput({
  value,
  onChange,
  placeholder = 'Search files…',
  onArrowDown,
}: SearchInputProps) {
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const flushChange = (next: string) => {
    setLocal(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onChange(next);
    }, DEBOUNCE_MS);
  };

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setLocal('');
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <div
      className={cn(
        'group flex h-7 items-center gap-1.5 rounded-md border border-transparent bg-sidebar-accent/60 pl-2 pr-1',
        'focus-within:border-sidebar-ring/60 focus-within:bg-sidebar-accent/90',
        'transition-colors',
      )}
    >
      <SearchIcon
        aria-hidden
        className="size-3.5 shrink-0 text-sidebar-foreground/55 group-focus-within:text-sidebar-foreground/80"
      />
      <input
        ref={inputRef}
        type="text"
        role="searchbox"
        aria-label="Search files"
        value={local}
        placeholder={placeholder}
        onChange={(e) => flushChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && local !== '') {
            e.preventDefault();
            clear();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            onArrowDown?.();
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-[12.5px] text-sidebar-foreground placeholder:text-sidebar-foreground/50 outline-none"
      />
      {local !== '' ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={clear}
          className="grid size-5 shrink-0 place-items-center rounded text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <XIcon className="size-3" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** Wrap the matching portion of `text` in a styled span for match highlighting. */
export function renderWithMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (q === '') return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx >= 0) {
    return (
      <>
        {text.slice(0, idx)}
        <span className="rounded-[3px] bg-sidebar-primary/20 text-sidebar-foreground">
          {text.slice(idx, idx + q.length)}
        </span>
        {text.slice(idx + q.length)}
      </>
    );
  }
  const lowerQ = q.toLowerCase();
  const nodes: React.ReactNode[] = [];
  let qi = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (qi < lowerQ.length && lower[i] === lowerQ[qi]) {
      nodes.push(
        <span
          key={i}
          className="rounded-[3px] bg-sidebar-primary/20 text-sidebar-foreground"
        >
          {char}
        </span>,
      );
      qi++;
    } else {
      nodes.push(char);
    }
  }
  return <>{nodes}</>;
}
