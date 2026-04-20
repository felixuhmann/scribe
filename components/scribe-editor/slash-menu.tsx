import type { Editor, Range } from '@tiptap/core';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image as ImageIcon,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Table as TableIcon,
  Type,
} from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

export type SlashCommandRunArgs = { editor: Editor; range: Range };

type SlashCommand = {
  id: string;
  label: string;
  hint: string;
  keywords: string[];
  icon: ReactNode;
  run: (args: SlashCommandRunArgs) => void;
};

const ITEMS: SlashCommand[] = [
  {
    id: 'heading-1',
    label: 'Heading 1',
    hint: 'Biggest title',
    keywords: ['h1', 'title'],
    icon: <Heading1 className="size-4" />,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
  },
  {
    id: 'heading-2',
    label: 'Heading 2',
    hint: 'Section heading',
    keywords: ['h2', 'section'],
    icon: <Heading2 className="size-4" />,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
  },
  {
    id: 'heading-3',
    label: 'Heading 3',
    hint: 'Subsection',
    keywords: ['h3'],
    icon: <Heading3 className="size-4" />,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
  },
  {
    id: 'paragraph',
    label: 'Text',
    hint: 'Plain paragraph',
    keywords: ['p', 'body', 'paragraph'],
    icon: <Type className="size-4" />,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    id: 'bullet-list',
    label: 'Bulleted list',
    hint: 'Unordered list',
    keywords: ['ul', 'bullets', 'dots'],
    icon: <List className="size-4" />,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: 'ordered-list',
    label: 'Numbered list',
    hint: 'Ordered list',
    keywords: ['ol', 'numbers', 'ordered'],
    icon: <ListOrdered className="size-4" />,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: 'task-list',
    label: 'Task list',
    hint: 'Checkbox items',
    keywords: ['todo', 'task', 'check', 'tasks'],
    icon: <ListTodo className="size-4" />,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: 'quote',
    label: 'Quote',
    hint: 'Highlighted aside',
    keywords: ['quote', 'blockquote'],
    icon: <Quote className="size-4" />,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: 'code-block',
    label: 'Code block',
    hint: 'Monospaced, syntax-highlighted',
    keywords: ['code', 'snippet', 'pre'],
    icon: <Code2 className="size-4" />,
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    id: 'callout',
    label: 'Callout',
    hint: 'Info / warning note',
    keywords: ['callout', 'note', 'aside', 'tip', 'warning'],
    icon: <Highlighter className="size-4" />,
    run: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setCallout('info')
        .run(),
  },
  {
    id: 'table',
    label: 'Table',
    hint: '3 × 3 with header',
    keywords: ['table', 'grid'],
    icon: <TableIcon className="size-4" />,
    run: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    id: 'image',
    label: 'Image',
    hint: 'Insert from URL',
    keywords: ['image', 'picture', 'photo', 'img'],
    icon: <ImageIcon className="size-4" />,
    run: ({ editor, range }) => {
      const url = window.prompt('Image URL');
      if (!url || !url.trim()) return;
      editor.chain().focus().deleteRange(range).setImage({ src: url.trim() }).run();
    },
  },
  {
    id: 'divider',
    label: 'Divider',
    hint: 'Horizontal rule',
    keywords: ['hr', 'divider', 'rule', 'separator', 'break'],
    icon: <Minus className="size-4" />,
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
];

export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return ITEMS;
  return ITEMS.filter((item) => {
    const hay = `${item.label} ${item.hint} ${item.keywords.join(' ')}`.toLowerCase();
    return hay.includes(q);
  });
}

export type SlashMenuHandle = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
};

type SlashMenuViewProps = SuggestionProps<SlashCommand, { run: (args: SlashCommandRunArgs) => void }> & {
  rect: DOMRect | null;
};

export const SlashMenuView = forwardRef<SlashMenuHandle, SlashMenuViewProps>(function SlashMenuView(
  { items, command, rect },
  ref,
) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => setActiveIndex(0), [items]);

  const pick = (index: number) => {
    const item = items[index];
    if (!item) return;
    command({ run: item.run });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowDown') {
        setActiveIndex((i) => (i + 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === 'ArrowUp') {
        setActiveIndex((i) => (i - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === 'Enter') {
        pick(activeIndex);
        return true;
      }
      return false;
    },
  }));

  const style = useMemo<React.CSSProperties>(() => {
    if (!rect) return { display: 'none' };
    const margin = 6;
    const top = Math.min(rect.bottom + margin, window.innerHeight - 320);
    const left = Math.min(Math.max(rect.left, 8), window.innerWidth - 296);
    return { top, left, position: 'fixed', zIndex: 60 };
  }, [rect]);

  if (!rect) return null;
  if (items.length === 0) {
    return createPortal(
      <div
        style={style}
        className="border-border bg-popover text-popover-foreground w-72 rounded-lg border p-3 text-xs shadow-xl"
        role="listbox"
      >
        <p className="text-muted-foreground">No matching blocks</p>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      style={style}
      className="border-border bg-popover text-popover-foreground w-72 overflow-hidden rounded-lg border p-1 shadow-xl"
      role="listbox"
    >
      <p className="text-muted-foreground px-2 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide">
        Insert
      </p>
      <ul className="flex flex-col">
        {items.map((item, idx) => {
          const isActive = idx === activeIndex;
          return (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(idx);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground/90 hover:bg-muted/60',
                )}
              >
                <span className="border-border bg-background/40 text-muted-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-md border">
                  {item.icon}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{item.label}</span>
                  <span className="text-muted-foreground truncate text-xs">{item.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>,
    document.body,
  );
});
