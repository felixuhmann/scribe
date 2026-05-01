import type { Editor } from '@tiptap/core';
import {
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  Replace,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { searchPluginKey, type SearchPluginState } from './search-extension';

export type EditorSearchBarProps = {
  editor: Editor | null;
  open: boolean;
  onClose: () => void;
};

function readSearchState(editor: Editor | null): SearchPluginState | null {
  if (!editor) return null;
  return searchPluginKey.getState(editor.state) ?? null;
}

export function EditorSearchBar({ editor, open, onClose }: EditorSearchBarProps) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [pluginState, setPluginState] = useState<SearchPluginState | null>(() =>
    readSearchState(editor),
  );

  const inputRef = useRef<HTMLInputElement>(null);

  /** Subscribe to editor transactions to mirror plugin state into React. */
  useEffect(() => {
    if (!editor) return;
    const sync = () => setPluginState(readSearchState(editor));
    sync();
    editor.on('transaction', sync);
    return () => {
      editor.off('transaction', sync);
    };
  }, [editor]);

  /** Push the query to the editor whenever it changes (or the case toggle flips). */
  useEffect(() => {
    if (!editor) return;
    if (!open) return;
    editor.commands.setSearchQuery(query, { caseSensitive });
  }, [editor, query, caseSensitive, open]);

  /** Seed the input with selected text and focus it whenever the bar opens. */
  useEffect(() => {
    if (!open || !editor) return;
    const { from, to, empty } = editor.state.selection;
    if (!empty) {
      const selected = editor.state.doc.textBetween(from, to, '\n');
      if (selected && !selected.includes('\n') && selected.length <= 200) {
        setQuery(selected);
      }
    }
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, editor]);

  /** Clear search highlights when the bar closes. */
  useEffect(() => {
    if (!editor) return;
    if (open) return;
    editor.commands.clearSearch();
  }, [editor, open]);

  const total = pluginState?.results.length ?? 0;
  const currentIndex = pluginState?.currentIndex ?? -1;
  const currentFrom =
    pluginState && currentIndex >= 0 ? pluginState.results[currentIndex]?.from ?? null : null;
  const positionLabel = useMemo(() => {
    if (!query) return '';
    if (total === 0) return 'No results';
    const display = currentIndex < 0 ? 1 : currentIndex + 1;
    return `${display} of ${total}`;
  }, [currentIndex, query, total]);

  /**
   * Whenever the active match moves (navigation, new query, doc edits), scroll the
   * matching DOM node into view inside the editor canvas. We rely on the rendered
   * decoration carrying `scribe-search-match-current` so that nested scroll containers
   * are also handled correctly by the browser.
   */
  useEffect(() => {
    if (!editor || !open || currentFrom == null) return;
    const id = window.requestAnimationFrame(() => {
      const el = editor.view.dom.querySelector<HTMLElement>('.scribe-search-match-current');
      if (!el) return;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [editor, open, currentFrom]);

  const goNext = useCallback(() => {
    if (!editor || total === 0) return;
    editor.commands.findNextMatch();
  }, [editor, total]);

  const goPrev = useCallback(() => {
    if (!editor || total === 0) return;
    editor.commands.findPreviousMatch();
  }, [editor, total]);

  const handleClose = useCallback(() => {
    if (editor) editor.commands.clearSearch();
    onClose();
    // Return focus to the document so typing continues naturally.
    window.setTimeout(() => editor?.commands.focus(), 0);
  }, [editor, onClose]);

  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      goNext();
    },
    [goNext],
  );

  const onQueryKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) goPrev();
        else goNext();
      }
    },
    [goNext, goPrev, handleClose],
  );

  const onReplaceKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    },
    [handleClose],
  );

  const replaceCurrent = useCallback(() => {
    if (!editor || total === 0) return;
    editor.commands.replaceCurrentMatch(replacement);
    // Advance to the next match after the replacement settles.
    window.setTimeout(() => editor.commands.findNextMatch(), 0);
  }, [editor, replacement, total]);

  const replaceAll = useCallback(() => {
    if (!editor || total === 0) return;
    editor.commands.replaceAllMatches(replacement);
  }, [editor, replacement, total]);

  if (!open) return null;

  const noResults = !!query && total === 0;

  return (
    <div
      role="search"
      aria-label="Find in document"
      data-scribe-find-bar=""
      className={cn(
        'absolute right-4 top-3 z-30 flex w-[min(28rem,calc(100%-2rem))] flex-col gap-2',
        'rounded-xl border border-border bg-popover/95 p-2 shadow-lg backdrop-blur',
      )}
    >
      <form onSubmit={onSubmit} className="flex items-center gap-1.5">
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onQueryKeyDown}
          placeholder="Find in document"
          aria-label="Find"
          data-scribe-find-input=""
          aria-invalid={noResults}
          className={cn('h-8 flex-1', noResults && 'border-destructive/60')}
          spellCheck={false}
          autoCorrect="off"
          autoComplete="off"
        />
        <span
          className="min-w-[4.5rem] shrink-0 text-right text-xs tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {positionLabel}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-pressed={caseSensitive}
                aria-label="Match case"
                onClick={() => setCaseSensitive((v) => !v)}
                data-active={caseSensitive ? 'true' : undefined}
              >
                <CaseSensitive className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Match case</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-pressed={replaceMode}
                aria-label="Toggle replace"
                onClick={() => setReplaceMode((v) => !v)}
                data-active={replaceMode ? 'true' : undefined}
              >
                <Replace className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Replace…</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Previous match"
                disabled={total === 0}
                onClick={goPrev}
              >
                <ChevronUp className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Previous (⇧↵)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Next match"
                disabled={total === 0}
                onClick={goNext}
              >
                <ChevronDown className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Next (↵)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Close find bar"
                onClick={handleClose}
              >
                <X className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close (Esc)</TooltipContent>
          </Tooltip>
        </div>
      </form>
      {replaceMode ? (
        <div className="flex items-center gap-1.5">
          <Input
            type="text"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={onReplaceKeyDown}
            placeholder="Replace with"
            aria-label="Replace with"
            className="h-8 flex-1"
            spellCheck={false}
            autoCorrect="off"
            autoComplete="off"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={total === 0}
            onClick={replaceCurrent}
          >
            Replace
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={total === 0}
            onClick={replaceAll}
          >
            Replace all
          </Button>
        </div>
      ) : null}
    </div>
  );
}
