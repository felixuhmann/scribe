import { Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

import { useEditorChromeState } from './use-editor-chrome-state';

export type ScribeEditorFooterProps = {
  autocompleteEnabled: boolean;
};

export function ScribeEditorFooter({ autocompleteEnabled }: ScribeEditorFooterProps) {
  const { wordCount, selectionWordCount } = useEditorChromeState();

  return (
    <footer
      className="bg-background/80 supports-[backdrop-filter]:bg-background/60 z-40 flex shrink-0 items-center justify-between gap-4 border-t border-border/60 px-3 py-1.5 backdrop-blur-sm"
      role="contentinfo"
    >
      <p className="text-muted-foreground flex min-w-0 flex-1 items-center gap-3 text-[11px] tabular-nums">
        <span className="truncate">
          {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
          {selectionWordCount > 0 && (
            <>
              {' '}
              <span className="text-muted-foreground/60">
                ({selectionWordCount.toLocaleString()} selected)
              </span>
            </>
          )}
        </span>
      </p>

      <div className="flex shrink-0 items-center gap-2 text-[11px]">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition-colors',
            autocompleteEnabled
              ? 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200'
              : 'border-border/70 bg-muted/40 text-muted-foreground',
          )}
          title={
            autocompleteEnabled
              ? 'AI autocomplete is on · press Tab to accept ghost suggestions'
              : 'AI autocomplete is off · toggle in settings or the command palette'
          }
        >
          <Sparkles
            className={cn(
              'size-3 shrink-0',
              autocompleteEnabled ? 'text-emerald-600 dark:text-emerald-300' : 'text-muted-foreground/50',
            )}
            aria-hidden
          />
          <span className="font-medium">AI {autocompleteEnabled ? 'on' : 'off'}</span>
        </span>
      </div>
    </footer>
  );
}
