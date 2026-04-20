import { useMemo } from 'react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export type ShortcutsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mod: string;
};

function Keys({ keys }: { keys: string[] }) {
  return (
    <div className="flex items-center gap-1">
      {keys.map((k, i) => (
        <kbd
          key={`${k}-${i}`}
          className={cn(
            'border-border bg-muted/50 text-foreground inline-flex min-w-[1.5rem] items-center justify-center rounded border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums shadow-sm',
          )}
        >
          {k}
        </kbd>
      ))}
    </div>
  );
}

type Row = { label: string; keys: string[] };

function section(title: string, rows: Row[]) {
  return { title, rows };
}

export function ShortcutsSheet({ open, onOpenChange, mod }: ShortcutsSheetProps) {
  const sections = useMemo(
    () => [
      section('Essentials', [
        { label: 'Open command palette', keys: [mod, 'K'] },
        { label: 'Insert block (slash menu)', keys: ['/'] },
        { label: 'Save', keys: [mod, 'S'] },
        { label: 'Save as…', keys: [mod, '⇧', 'S'] },
        { label: 'Insert / edit link', keys: [mod, '⇧', 'K'] },
        { label: 'Settings', keys: [mod, ','] },
      ]),
      section('Formatting', [
        { label: 'Bold', keys: [mod, 'B'] },
        { label: 'Italic', keys: [mod, 'I'] },
        { label: 'Underline', keys: [mod, 'U'] },
        { label: 'Strikethrough', keys: [mod, '⇧', 'X'] },
        { label: 'Inline code', keys: [mod, 'E'] },
        { label: 'Bulleted list', keys: [mod, '⇧', '8'] },
        { label: 'Numbered list', keys: [mod, '⇧', '7'] },
        { label: 'Quote', keys: [mod, '⇧', 'B'] },
      ]),
      section('Document view', [
        { label: 'Focus mode', keys: [mod, '⇧', 'F'] },
        { label: 'Zoom in', keys: [mod, '+'] },
        { label: 'Zoom out', keys: [mod, '-'] },
        { label: 'Reset zoom', keys: [mod, '0'] },
      ]),
      section('AI', [
        { label: 'Ask AI about selection', keys: [mod, '.'] },
        { label: 'Accept autocomplete suggestion', keys: ['Tab'] },
        { label: 'Dismiss autocomplete suggestion', keys: ['Esc'] },
      ]),
    ],
    [mod],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(28rem,100vw)] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Keyboard shortcuts</SheetTitle>
          <SheetDescription>
            Power-user shortcuts for writing fast. Press <kbd className="bg-muted rounded border px-1 py-0.5 text-[10px]">Esc</kbd>{' '}
            to close.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 p-4 pt-0">
          {sections.map((s) => (
            <section key={s.title} className="flex flex-col gap-1">
              <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                {s.title}
              </h3>
              <ul className="divide-border divide-y">
                {s.rows.map((r) => (
                  <li key={r.label} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="text-foreground/90">{r.label}</span>
                    <Keys keys={r.keys} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
