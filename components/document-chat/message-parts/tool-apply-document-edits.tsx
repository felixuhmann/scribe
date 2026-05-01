import { useMemo, useState } from 'react';
import { AlertTriangleIcon, FileDiffIcon, PenLineIcon, Undo2Icon } from 'lucide-react';

import { DocumentDiffView } from '@/components/document-chat/document-diff-view';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';

type ApplyDocumentEditsPart = Extract<
  DocumentChatUIMessage['parts'][number],
  { type: 'tool-applyDocumentEdits' }
>;

export type ApplyDocumentEditsOutput = {
  html: string;
  markdown: string;
  editCount: number;
  edits: Array<{
    kind: 'strReplace' | 'appendDocument';
    summary: string;
    startLine: number;
    endLine: number;
  }>;
  rationale?: string;
  staleSnapshot?: boolean;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

/**
 * Extract the typed output of a completed `tool-applyDocumentEdits` part.
 * Returns null while the synthetic tool call is still streaming or didn't
 * finish (e.g. agent crashed before the final flush).
 */
export function getApplyEditsOutput(
  part: DocumentChatUIMessage['parts'][number],
): ApplyDocumentEditsOutput | null {
  if (part.type !== 'tool-applyDocumentEdits') return null;
  if (part.state !== 'output-available') return null;
  const out = part.output;
  if (!isObject(out)) return null;
  const html = typeof out.html === 'string' ? out.html : '';
  const markdown = typeof out.markdown === 'string' ? out.markdown : '';
  const editCount = typeof out.editCount === 'number' ? out.editCount : 0;
  const editsRaw = Array.isArray(out.edits) ? out.edits : [];
  const edits = editsRaw
    .map((e) => {
      if (!isObject(e)) return null;
      const kind = e.kind === 'strReplace' || e.kind === 'appendDocument' ? e.kind : null;
      if (!kind) return null;
      const summary = typeof e.summary === 'string' ? e.summary : '';
      const startLine = typeof e.startLine === 'number' ? e.startLine : 1;
      const endLine = typeof e.endLine === 'number' ? e.endLine : startLine;
      return { kind, summary, startLine, endLine };
    })
    .filter((e): e is ApplyDocumentEditsOutput['edits'][number] => e !== null);
  const rationale = typeof out.rationale === 'string' ? out.rationale : undefined;
  const staleSnapshot = typeof out.staleSnapshot === 'boolean' ? out.staleSnapshot : undefined;
  return { html, markdown, editCount, edits, rationale, staleSnapshot };
}

export function ToolApplyDocumentEditsPart({
  part,
  previousHtml,
  canUndo,
  onUndo,
}: {
  part: ApplyDocumentEditsPart;
  /** HTML captured the moment this apply landed; fed to the diff dialog. */
  previousHtml?: string;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const [undone, setUndone] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);

  const output = useMemo(() => getApplyEditsOutput(part), [part]);
  const nextHtml = output?.html ?? '';
  const editCount = output?.editCount ?? 0;
  const stale = output?.staleSnapshot === true;

  if (part.state === 'output-error') {
    return (
      <div className="border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2 text-xs">
        <PenLineIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <p>The assistant tried to apply edits but something went wrong.</p>
      </div>
    );
  }

  if (part.state !== 'output-available') {
    return (
      <div className="border-border bg-muted/40 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
        <Spinner className="shrink-0" />
        <span className="text-muted-foreground">Applying document edits…</span>
      </div>
    );
  }

  const headline = undone
    ? 'Edits reverted'
    : editCount === 0
      ? 'No changes applied'
      : `Applied ${editCount} edit${editCount === 1 ? '' : 's'}`;

  return (
    <>
      <div className="border-border bg-card text-card-foreground flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm">
        <div className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-md">
          <PenLineIcon aria-hidden className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-foreground text-sm font-medium leading-tight">{headline}</p>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
            {undone
              ? 'The document was restored to its previous state.'
              : 'The assistant edited the document via small targeted changes.'}
          </p>
          {stale && !undone ? (
            <p className="mt-1.5 flex items-start gap-1 rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
              <AlertTriangleIcon aria-hidden className="mt-0.5 size-3 shrink-0" />
              <span>
                Your editor changed while the assistant was working. Compare the diff before
                continuing.
              </span>
            </p>
          ) : null}
          {output && output.edits.length > 0 ? (
            <ul className="text-muted-foreground mt-2 max-h-32 list-disc overflow-y-auto pl-4 text-xs leading-snug">
              {output.edits.slice(0, 8).map((edit, i) => (
                <li key={i}>
                  <span className="text-foreground/80 font-mono text-[10px]">
                    L{edit.startLine}
                    {edit.endLine !== edit.startLine ? `-${edit.endLine}` : ''}
                  </span>{' '}
                  {edit.summary}
                </li>
              ))}
              {output.edits.length > 8 ? (
                <li className="text-muted-foreground/70">
                  + {output.edits.length - 8} more
                </li>
              ) : null}
            </ul>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setDiffOpen(true)}
              disabled={!nextHtml}
            >
              <FileDiffIcon data-icon="inline-start" aria-hidden />
              View diff
            </Button>
            {!undone && editCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={!canUndo}
                onClick={() => {
                  onUndo();
                  setUndone(true);
                }}
              >
                <Undo2Icon data-icon="inline-start" aria-hidden />
                Undo
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="flex max-h-[80vh] flex-col gap-3 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Document changes</DialogTitle>
            <DialogDescription>
              Additions in green, removals in red. Unchanged context is collapsed and expandable.
            </DialogDescription>
          </DialogHeader>
          <DocumentDiffView
            beforeHtml={previousHtml}
            afterHtml={nextHtml}
            className="min-h-0 flex-1"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
