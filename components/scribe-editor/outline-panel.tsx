import { List } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useEditorSession } from '@/components/editor-session-context';
import { cn } from '@/lib/utils';

type OutlineEntry = {
  id: string;
  level: 1 | 2 | 3;
  text: string;
  pos: number;
};

function readEntries(doc: { descendants: (cb: (node: unknown, pos: number) => boolean | void) => void }): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  let counter = 0;
  doc.descendants((node: unknown, pos: number) => {
    const n = node as {
      type: { name: string };
      attrs: { level?: number };
      textContent: string;
      isBlock: boolean;
    };
    if (n.type.name !== 'heading') return true;
    const level = n.attrs.level as 1 | 2 | 3 | undefined;
    if (!level || level < 1 || level > 3) return true;
    const text = n.textContent.trim();
    if (!text) return false;
    counter += 1;
    out.push({ id: `outline-${counter}`, level, text, pos });
    return false;
  });
  return out;
}

export function OutlinePanel() {
  const { editor } = useEditorSession();
  const [entries, setEntries] = useState<OutlineEntry[]>([]);

  useEffect(() => {
    if (!editor) {
      setEntries([]);
      return;
    }
    const sync = () => setEntries(readEntries(editor.state.doc));
    sync();
    editor.on('update', sync);
    editor.on('selectionUpdate', sync);
    return () => {
      editor.off('update', sync);
      editor.off('selectionUpdate', sync);
    };
  }, [editor]);

  const jumpTo = (entry: OutlineEntry) => {
    if (!editor) return;
    const $pos = editor.state.doc.resolve(entry.pos);
    editor
      .chain()
      .focus()
      .setTextSelection($pos.pos + 1)
      .scrollIntoView()
      .run();
  };

  if (!editor) {
    return (
      <div className="text-muted-foreground px-3 py-6 text-sm">Open a document to see its outline.</div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <div className="border-border bg-background/60 flex size-10 items-center justify-center rounded-full border">
          <List className="text-muted-foreground size-5" aria-hidden />
        </div>
        <p className="text-foreground text-sm font-medium">No headings yet</p>
        <p className="text-muted-foreground text-xs">
          Add a heading (press <kbd className="border-border bg-muted/60 rounded border px-1 text-[10px]">/</kbd>{' '}
          then choose one) and it will show up here.
        </p>
      </div>
    );
  }

  return (
    <nav aria-label="Document outline" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      {entries.map((entry) => (
        <button
          type="button"
          key={entry.id}
          onClick={() => jumpTo(entry)}
          className={cn(
            'flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
            'text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
            entry.level === 1 && 'font-semibold text-sidebar-foreground',
            entry.level === 2 && 'font-medium',
            entry.level === 3 && 'text-sidebar-foreground/70',
          )}
          style={{ paddingInlineStart: `${(entry.level - 1) * 12 + 8}px` }}
          title={entry.text}
        >
          <span
            aria-hidden
            className={cn(
              'mt-2 inline-block h-1 w-1 shrink-0 rounded-full',
              entry.level === 1
                ? 'bg-foreground'
                : entry.level === 2
                  ? 'bg-foreground/60'
                  : 'bg-foreground/30',
            )}
          />
          <span className="truncate">{entry.text}</span>
        </button>
      ))}
    </nav>
  );
}
