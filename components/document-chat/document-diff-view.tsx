import { useMemo, useState } from 'react';
import { ChevronDownIcon, MinusIcon, PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  type DiffRow,
  type DiffSegment,
  type DiffStats,
  buildStructuredDiff,
} from '@/lib/document-change-diff';

type DocumentDiffViewProps = {
  beforeHtml?: string;
  afterHtml: string;
  className?: string;
};

/**
 * Renders a readable unified diff between two document HTML snapshots.
 * Block structure (paragraphs, headings, lists) is preserved, and adjacent
 * removed/added lines are annotated with inline word-level changes.
 */
export function DocumentDiffView({ beforeHtml, afterHtml, className }: DocumentDiffViewProps) {
  const { rows, stats } = useMemo(
    () => buildStructuredDiff(beforeHtml ?? '', afterHtml),
    [beforeHtml, afterHtml],
  );

  const hasChanges = rows.some((r) => r.kind === 'added' || r.kind === 'removed');

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <DiffStatsBar stats={stats} />
      <div className="border-border min-h-0 flex-1 overflow-auto rounded-md border">
        {hasChanges ? (
          <ol className="divide-border/60 divide-y text-sm">
            {rows.map((row) => (
              <DiffRowView key={row.key} row={row} />
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground p-6 text-center text-xs">
            No textual changes between versions.
          </p>
        )}
      </div>
    </div>
  );
}

function DiffStatsBar({ stats }: { stats: DiffStats }) {
  const unchanged = stats.added === 0 && stats.removed === 0;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
      {stats.addedWords > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
          <PlusIcon aria-hidden className="size-3" />
          {stats.addedWords} word{stats.addedWords === 1 ? '' : 's'}
        </span>
      ) : null}
      {stats.removedWords > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive">
          <MinusIcon aria-hidden className="size-3" />
          {stats.removedWords} word{stats.removedWords === 1 ? '' : 's'}
        </span>
      ) : null}
      <span className="text-muted-foreground">
        {unchanged
          ? 'No changes'
          : `${stats.added} line${stats.added === 1 ? '' : 's'} added · ${stats.removed} removed`}
      </span>
    </div>
  );
}

function DiffRowView({ row }: { row: DiffRow }) {
  if (row.kind === 'collapsed') return <CollapsedRow row={row} />;
  return <LineRow row={row} />;
}

function CollapsedRow({
  row,
}: {
  row: Extract<DiffRow, { kind: 'collapsed' }>;
}) {
  const [expanded, setExpanded] = useState(false);
  if (expanded) {
    return (
      <>
        {row.rows.map((r) => (
          <LineRow key={r.key} row={r as Exclude<DiffRow, { kind: 'collapsed' }>} />
        ))}
      </>
    );
  }
  return (
    <li className="bg-muted/20 hover:bg-muted/40 flex items-center gap-2 px-3 py-1.5 text-xs">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground h-6 gap-1 px-1.5 text-[11px] font-normal"
        onClick={() => setExpanded(true)}
      >
        <ChevronDownIcon aria-hidden className="size-3" />
        Expand {row.count} unchanged line{row.count === 1 ? '' : 's'}
      </Button>
    </li>
  );
}

function LineRow({
  row,
}: {
  row: Exclude<DiffRow, { kind: 'collapsed' }>;
}) {
  const gutterChar = row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' ';

  const rowClass = cn(
    'flex items-stretch gap-0 leading-snug',
    row.kind === 'added' && 'bg-emerald-500/[0.08] dark:bg-emerald-400/10',
    row.kind === 'removed' && 'bg-destructive/[0.08]',
  );

  const gutterClass = cn(
    'shrink-0 select-none px-2 py-1 text-center font-mono text-xs tabular-nums',
    row.kind === 'added' && 'text-emerald-700 dark:text-emerald-300',
    row.kind === 'removed' && 'text-destructive',
    row.kind === 'context' && 'text-muted-foreground/60',
  );

  const textClass = cn(
    'min-w-0 flex-1 whitespace-pre-wrap break-words py-1 pr-3 text-sm',
    row.kind === 'context' && 'text-muted-foreground',
    row.kind === 'added' && 'text-foreground',
    row.kind === 'removed' && 'text-foreground',
  );

  // Render inline word-level segments when available.
  const hasSegments =
    (row.kind === 'added' || row.kind === 'removed') && row.segments && row.segments.length > 0;

  return (
    <li className={rowClass}>
      <span className={gutterClass} aria-hidden>
        {gutterChar}
      </span>
      <span className={textClass}>
        {hasSegments
          ? row.segments!.map((seg, i) => <InlineSegment key={i} segment={seg} />)
          : row.text || '\u00A0'}
      </span>
    </li>
  );
}

function InlineSegment({ segment }: { segment: DiffSegment }) {
  if (segment.kind === 'equal') {
    return <span className="opacity-60">{segment.text}</span>;
  }
  if (segment.kind === 'added') {
    return (
      <span className="rounded-[3px] bg-emerald-500/30 px-0.5 font-medium text-emerald-950 dark:bg-emerald-400/30 dark:text-emerald-50">
        {segment.text}
      </span>
    );
  }
  return (
    <span className="bg-destructive/25 decoration-destructive/70 rounded-[3px] px-0.5 font-medium text-foreground line-through">
      {segment.text}
    </span>
  );
}
