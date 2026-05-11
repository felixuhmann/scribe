import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'scribe.table.lastSize';
const MAX_GRID = 10;
const MIN_DIM = 1;
const MAX_DIM = 50;

type LastSize = { rows: number; cols: number; withHeaderRow: boolean };

function loadLastSize(): LastSize {
  if (typeof window === 'undefined') return { rows: 3, cols: 3, withHeaderRow: true };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { rows: 3, cols: 3, withHeaderRow: true };
    const parsed = JSON.parse(raw) as Partial<LastSize>;
    return {
      rows: clamp(parsed.rows ?? 3, MIN_DIM, MAX_DIM),
      cols: clamp(parsed.cols ?? 3, MIN_DIM, MAX_DIM),
      withHeaderRow: parsed.withHeaderRow ?? true,
    };
  } catch {
    return { rows: 3, cols: 3, withHeaderRow: true };
  }
}

function saveLastSize(size: LastSize): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(size));
  } catch {
    /* ignore */
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export type InsertTableDialogProps = {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function InsertTableDialog({ editor, open, onOpenChange }: InsertTableDialogProps) {
  const [size, setSize] = useState<LastSize>(() => loadLastSize());
  const [hover, setHover] = useState<{ rows: number; cols: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setSize(loadLastSize());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => gridRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  const insert = useCallback(
    (override?: { rows?: number; cols?: number }) => {
      const next: LastSize = {
        rows: clamp(override?.rows ?? size.rows, MIN_DIM, MAX_DIM),
        cols: clamp(override?.cols ?? size.cols, MIN_DIM, MAX_DIM),
        withHeaderRow: size.withHeaderRow,
      };
      saveLastSize(next);
      editor
        .chain()
        .focus()
        .insertTable({ rows: next.rows, cols: next.cols, withHeaderRow: next.withHeaderRow })
        .run();
      onOpenChange(false);
    },
    [editor, onOpenChange, size],
  );

  const previewRows = hover?.rows ?? size.rows;
  const previewCols = hover?.cols ?? size.cols;

  const cells = useMemo(() => {
    const out: Array<{ key: string; row: number; col: number; on: boolean }> = [];
    for (let r = 1; r <= MAX_GRID; r += 1) {
      for (let c = 1; c <= MAX_GRID; c += 1) {
        out.push({
          key: `${r}-${c}`,
          row: r,
          col: c,
          on: r <= previewRows && c <= previewCols,
        });
      }
    }
    return out;
  }, [previewRows, previewCols]);

  const onGridKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSize((s) => ({ ...s, cols: clamp(s.cols + 1, MIN_DIM, MAX_GRID) }));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSize((s) => ({ ...s, cols: clamp(s.cols - 1, MIN_DIM, MAX_GRID) }));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSize((s) => ({ ...s, rows: clamp(s.rows + 1, MIN_DIM, MAX_GRID) }));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSize((s) => ({ ...s, rows: clamp(s.rows - 1, MIN_DIM, MAX_GRID) }));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        insert();
      }
    },
    [insert],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Insert table</DialogTitle>
          <DialogDescription>
            Drag the grid to pick a size, or type exact dimensions below. Press Enter to insert.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={gridRef}
          tabIndex={0}
          role="grid"
          aria-label="Table size grid"
          onKeyDown={onGridKey}
          onMouseLeave={() => setHover(null)}
          className={cn(
            'mx-auto grid w-fit grid-cols-10 gap-1 rounded-md border border-border bg-card p-2 outline-none',
            'focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          {cells.map(({ key, row, col, on }) => (
            <button
              type="button"
              key={key}
              role="gridcell"
              aria-selected={on}
              onMouseEnter={() => setHover({ rows: row, cols: col })}
              onClick={() => insert({ rows: row, cols: col })}
              className={cn(
                'size-5 rounded-sm border border-border/70 transition-colors',
                on ? 'bg-primary/80 border-primary' : 'bg-muted/40 hover:bg-muted',
              )}
              tabIndex={-1}
              aria-label={`${row} rows by ${col} columns`}
            />
          ))}
        </div>

        <p className="text-muted-foreground text-center text-xs tabular-nums">
          {previewRows} × {previewCols}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scribe-table-rows" className="text-xs">
              Rows
            </Label>
            <Input
              id="scribe-table-rows"
              type="number"
              min={MIN_DIM}
              max={MAX_DIM}
              value={size.rows}
              onChange={(e) =>
                setSize((s) => ({ ...s, rows: clamp(Number(e.target.value) || 1, MIN_DIM, MAX_DIM) }))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  insert();
                }
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="scribe-table-cols" className="text-xs">
              Columns
            </Label>
            <Input
              id="scribe-table-cols"
              type="number"
              min={MIN_DIM}
              max={MAX_DIM}
              value={size.cols}
              onChange={(e) =>
                setSize((s) => ({ ...s, cols: clamp(Number(e.target.value) || 1, MIN_DIM, MAX_DIM) }))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  insert();
                }
              }}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={size.withHeaderRow}
            onChange={(e) => setSize((s) => ({ ...s, withHeaderRow: e.target.checked }))}
            className="size-4 rounded border-border accent-primary"
          />
          <span>Use first row as header</span>
        </label>

        <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => insert()}>
            Insert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
