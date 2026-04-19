import { Sparkles } from 'lucide-react';

import { useDocumentWorkspace } from '@/components/document-workspace-context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useEditorChromeState } from './use-editor-chrome-state';

export type ScribeEditorFooterProps = {
  autocompleteEnabled: boolean;
  onToggleTabAutocomplete: () => void;
  togglePending?: boolean;
};

export function ScribeEditorFooter({
  autocompleteEnabled,
  onToggleTabAutocomplete,
  togglePending,
}: ScribeEditorFooterProps) {
  const { wordCount } = useEditorChromeState();
  const { isDirty } = useDocumentWorkspace();

  return (
    <footer
      className="bg-background/95 supports-[backdrop-filter]:bg-background/80 z-40 flex shrink-0 items-center justify-between gap-4 border-t border-border px-3 py-2 backdrop-blur-sm"
      role="contentinfo"
    >
      <p className="text-muted-foreground flex min-w-0 flex-1 items-center gap-2 text-xs tabular-nums">
        <span className="truncate">
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
          <span className="text-muted-foreground/70 mx-1.5">·</span>
          {isDirty ? (
            <span className="text-amber-800 dark:text-amber-400">Unsaved content</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-emerald-800 dark:text-emerald-400/90">
              Content saved
            </span>
          )}
        </span>
      </p>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={togglePending}
        aria-label={autocompleteEnabled ? 'Turn off tab autocomplete' : 'Turn on tab autocomplete'}
        aria-pressed={autocompleteEnabled}
        onClick={onToggleTabAutocomplete}
        className={cn(
          'h-8 shrink-0 gap-2 border px-2.5 font-medium transition-colors',
          autocompleteEnabled
            ? 'border-emerald-500/40 bg-emerald-500/[0.1] text-emerald-900 hover:bg-emerald-500/[0.16] hover:text-emerald-950 dark:border-emerald-400/35 dark:bg-emerald-400/15 dark:text-emerald-100 dark:hover:bg-emerald-400/22 dark:hover:text-emerald-50'
            : 'border-border/80 bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted/70 hover:text-foreground/85',
        )}
      >
        <Sparkles
          className={cn(
            'size-3.5 shrink-0 transition-colors',
            autocompleteEnabled
              ? 'text-emerald-600 dark:text-emerald-300'
              : 'text-muted-foreground/45',
          )}
          aria-hidden
        />
        <span className="hidden sm:inline">Tab autocomplete</span>
        <span
          className={cn(
            'rounded px-1 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide',
            autocompleteEnabled
              ? 'bg-emerald-600/15 text-emerald-800 dark:bg-emerald-300/20 dark:text-emerald-100'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {autocompleteEnabled ? 'On' : 'Off'}
        </span>
      </Button>
    </footer>
  );
}
