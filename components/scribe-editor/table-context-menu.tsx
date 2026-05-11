import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownAZ,
  ArrowRight,
  ArrowUp,
  ArrowUpAZ,
  Columns3,
  Combine,
  Eraser,
  Heading,
  PanelLeft,
  PanelTop,
  Rows3,
  ScanLine,
  SplitSquareHorizontal,
  Trash2,
} from 'lucide-react';
import { useCallback, useMemo, useRef, type ReactNode } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const containerClass =
  'bg-popover text-popover-foreground flex items-stretch gap-0.5 rounded-lg border border-border/70 p-1 shadow-xl backdrop-blur-md';

type IconButtonProps = {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
};

function IconButton({ active, disabled, title, onClick, children }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        if (disabled) return;
        onClick();
      }}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-sm transition-colors',
        'text-muted-foreground hover:bg-muted hover:text-foreground',
        'aria-pressed:bg-accent aria-pressed:text-accent-foreground',
        active && 'bg-accent text-accent-foreground',
        disabled && 'opacity-40 hover:bg-transparent hover:text-muted-foreground',
      )}
    >
      {children}
    </button>
  );
}

function MenuSeparator() {
  return <Separator orientation="vertical" className="mx-0.5 h-6 self-center" decorative />;
}

/**
 * Floats a contextual toolbar above the surrounding table whenever the caret is
 * inside one. Provides every common structural and formatting action so users
 * never need to leave the keyboard or hunt through nested menus.
 */
export function TableContextMenu({ editor }: { editor: Editor }) {
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const state = useEditorState({
    editor,
    selector: (ctx) => {
      const ed = ctx.editor;
      const inTable = ed.isActive('table');
      const cellAttrs = inTable ? ed.getAttributes('tableCell') : {};
      const headerAttrs = inTable ? ed.getAttributes('tableHeader') : {};
      const align: string | null =
        (cellAttrs.align as string | undefined) ?? (headerAttrs.align as string | undefined) ?? null;
      return {
        inTable,
        align,
        canMerge: inTable && ed.can().mergeCells(),
        canSplit: inTable && ed.can().splitCell(),
      };
    },
  });

  const { inTable, align, canMerge, canSplit } = state ?? {
    inTable: false,
    align: null,
    canMerge: false,
    canSplit: false,
  };

  // Stable callbacks so the React `BubbleMenu` wrapper does not push a fresh
  // `updateOptions` transaction on every render. The virtual element's
  // `getBoundingClientRect` deliberately re-resolves the table DOM each time
  // Floating UI calls it — after a structural change (add/remove row/col) the
  // `TableView` may have produced a new wrapper, so a captured reference would
  // be detached and would yield a (0,0) rect, snapping the menu to the corner.
  const shouldShow = useCallback(
    ({ editor: e }: { editor: Editor }) => e.isActive('table'),
    [],
  );

  const getReferencedVirtualElement = useCallback(() => {
    return {
      getBoundingClientRect: () => {
        const el = findTableDom(editor);
        if (el && el.isConnected) {
          const rect = el.getBoundingClientRect();
          // Guard against a transient zero-rect during in-place updates.
          if (rect.width > 0 || rect.height > 0) return rect;
        }
        // Fall back to the caret position so the menu at least sits near the user.
        try {
          const { from, to } = editor.state.selection;
          const start = editor.view.coordsAtPos(from);
          const end = editor.view.coordsAtPos(Math.max(from, to));
          const left = Math.min(start.left, end.left);
          const top = Math.min(start.top, end.top);
          const right = Math.max(start.right, end.right);
          const bottom = Math.max(start.bottom, end.bottom);
          return new DOMRect(left, top, Math.max(right - left, 1), Math.max(bottom - top, 1));
        } catch {
          return new DOMRect(0, 0, 0, 0);
        }
      },
    };
  }, [editor]);

  const options = useMemo(
    () => ({ placement: 'top-start' as const, offset: 10 }),
    [],
  );

  return (
    <BubbleMenu
      ref={menuContainerRef}
      editor={editor}
      pluginKey="scribeTableBubbleMenu"
      shouldShow={shouldShow}
      options={options}
      getReferencedVirtualElement={getReferencedVirtualElement}
      className={containerClass}
    >
      {inTable ? (
        <>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Rows"
                className={cn(
                  'text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 items-center gap-1 rounded-md px-2 text-sm transition-colors',
                )}
              >
                <Rows3 className="size-4" />
                <span className="max-md:hidden">Rows</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-56"
              portalContainer={menuContainerRef.current}
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                editor.view.focus();
              }}
            >
              <DropdownMenuLabel>Rows</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => editor.chain().focus().addRowBefore().run()}>
                <ArrowUp /> Insert above
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => editor.chain().focus().addRowAfter().run()}>
                <ArrowDown /> Insert below
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => editor.chain().focus().deleteRow().run()}>
                <Trash2 /> Delete row
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Columns"
                className={cn(
                  'text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 items-center gap-1 rounded-md px-2 text-sm transition-colors',
                )}
              >
                <Columns3 className="size-4" />
                <span className="max-md:hidden">Columns</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-56"
              portalContainer={menuContainerRef.current}
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                editor.view.focus();
              }}
            >
              <DropdownMenuLabel>Columns</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => editor.chain().focus().addColumnBefore().run()}>
                <ArrowUp className="rotate-[-90deg]" /> Insert left
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => editor.chain().focus().addColumnAfter().run()}>
                <ArrowRight /> Insert right
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => editor.chain().focus().deleteColumn().run()}>
                <Trash2 /> Delete column
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => editor.chain().focus().distributeTableColumns().run()}>
                <ScanLine /> Distribute evenly
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => editor.chain().focus().sortTableByColumn('asc').run()}>
                <ArrowUpAZ /> Sort ascending
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => editor.chain().focus().sortTableByColumn('desc').run()}>
                <ArrowDownAZ /> Sort descending
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <MenuSeparator />

          <IconButton
            title="Align left"
            active={align === 'left'}
            onClick={() => editor.chain().focus().setCellAttribute('align', 'left').run()}
          >
            <AlignLeft className="size-4" />
          </IconButton>
          <IconButton
            title="Align center"
            active={align === 'center'}
            onClick={() => editor.chain().focus().setCellAttribute('align', 'center').run()}
          >
            <AlignCenter className="size-4" />
          </IconButton>
          <IconButton
            title="Align right"
            active={align === 'right'}
            onClick={() => editor.chain().focus().setCellAttribute('align', 'right').run()}
          >
            <AlignRight className="size-4" />
          </IconButton>

          <MenuSeparator />

          <IconButton
            title={canMerge ? 'Merge cells' : 'Split cell'}
            disabled={!canMerge && !canSplit}
            onClick={() => editor.chain().focus().mergeOrSplit().run()}
          >
            {canMerge ? <Combine className="size-4" /> : <SplitSquareHorizontal className="size-4" />}
          </IconButton>

          <MenuSeparator />

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Headers"
                className={cn(
                  'text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 items-center justify-center rounded-md px-2 text-sm transition-colors',
                )}
                aria-label="Headers"
              >
                <Heading className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
              portalContainer={menuContainerRef.current}
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                editor.view.focus();
              }}
            >
              <DropdownMenuLabel>Headers</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeaderRow().run()}>
                <PanelTop /> Toggle header row
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeaderColumn().run()}>
                <PanelLeft /> Toggle header column
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => editor.chain().focus().toggleHeaderCell().run()}>
                <Heading /> Toggle this cell
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <IconButton
            title="Clear selected cells"
            onClick={() => editor.chain().focus().clearSelectedCells().run()}
          >
            <Eraser className="size-4" />
          </IconButton>

          <MenuSeparator />

          <IconButton
            title="Delete table"
            onClick={() => editor.chain().focus().deleteTable().run()}
          >
            <Trash2 className="size-4 text-destructive" />
          </IconButton>
        </>
      ) : null}
    </BubbleMenu>
  );
}

/**
 * Resolves the surrounding table's wrapper DOM. We try two paths so the menu
 * stays anchored even when ProseMirror's position-to-DOM cache is stale (e.g.
 * mid-update after a structural command):
 *
 *   1. `nodeDOM(tablePos)` — the canonical mapping from PM.
 *   2. `domAtPos(caret).closest('div.tableWrapper, table')` — DOM-side walk
 *      from the caret, robust to TableView re-renders that swap the wrapper.
 */
function findTableDom(editor: Editor): HTMLElement | null {
  const $from = editor.state.selection.$from;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'table') {
      const dom = editor.view.nodeDOM($from.before(depth));
      const el = dom instanceof HTMLElement ? dom : (dom?.parentElement ?? null);
      if (el && el.isConnected) {
        const anchor = el.closest('div.tableWrapper, table');
        return (anchor instanceof HTMLElement ? anchor : el);
      }
      break;
    }
  }
  try {
    const at = editor.view.domAtPos($from.pos);
    const start = at.node instanceof Element ? at.node : at.node.parentElement;
    const anchor = start?.closest('div.tableWrapper, table');
    if (anchor instanceof HTMLElement) return anchor;
  } catch {
    /* ignore — selection may not have a stable DOM mapping during teardown */
  }
  return null;
}
