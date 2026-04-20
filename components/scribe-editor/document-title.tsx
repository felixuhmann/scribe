import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

import {
  IDLE_DOCUMENT_KEY,
  useDocumentWorkspace,
} from '@/components/document-workspace-context';
import { cn } from '@/lib/utils';

function splitBasename(basename: string): { name: string; ext: string } {
  const dot = basename.lastIndexOf('.');
  if (dot <= 0) return { name: basename, ext: '' };
  return { name: basename.slice(0, dot), ext: basename.slice(dot) };
}

/**
 * Inline-editable document title in the top bar.
 * - Disk-backed docs: edits rename the file via `window.scribe.renameFile`.
 * - Unsaved / local docs: edits update a local display-only draft name.
 */
export function DocumentTitle({ className }: { className?: string }) {
  const { documentKey, documentLabel, diskAbsolutePath, adoptSavedFilePath } = useDocumentWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);

  const basename = documentLabel;
  const { name: initialName, ext } = splitBasename(basename);
  const [draft, setDraft] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setDraft(initialName);
    setError(null);
  }, [initialName, documentKey]);

  const commit = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed === '' || trimmed === initialName) {
      setDraft(initialName);
      setError(null);
      return;
    }
    if (diskAbsolutePath && typeof window.scribe?.renameFile === 'function') {
      setPending(true);
      try {
        const result = await window.scribe.renameFile(diskAbsolutePath, trimmed + ext);
        if (!result.ok) {
          setError(result.error);
          setDraft(initialName);
          return;
        }
        adoptSavedFilePath(result.path);
        setError(null);
      } finally {
        setPending(false);
      }
    } else {
      setDraft(trimmed);
    }
  }, [adoptSavedFilePath, diskAbsolutePath, draft, ext, initialName]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        inputRef.current?.blur();
      } else if (e.key === 'Escape') {
        setDraft(initialName);
        setError(null);
        inputRef.current?.blur();
      }
    },
    [initialName],
  );

  if (documentKey === IDLE_DOCUMENT_KEY) return null;

  return (
    <div className={cn('relative flex min-w-0 items-baseline gap-0', className)}>
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (error) setError(null);
        }}
        onBlur={() => void commit()}
        onKeyDown={onKeyDown}
        disabled={pending}
        spellCheck={false}
        aria-label="Document title"
        aria-invalid={error ? true : undefined}
        title={error ?? basename}
        className={cn(
          'min-w-0 max-w-full truncate rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-medium text-foreground outline-none transition-colors',
          'hover:border-border focus:border-border focus:bg-muted/40',
          'placeholder:text-muted-foreground disabled:opacity-60',
          error && 'border-destructive/60 text-destructive',
        )}
        style={{ width: `${Math.max(draft.length, 8) + 2}ch` }}
      />
      {ext ? (
        <span className="text-muted-foreground/70 pointer-events-none text-sm">{ext}</span>
      ) : null}
    </div>
  );
}
