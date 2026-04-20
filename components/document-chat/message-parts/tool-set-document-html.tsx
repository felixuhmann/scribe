import { useMemo, useState } from 'react';
import { FileDiffIcon, PenLineIcon, Undo2Icon } from 'lucide-react';

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

type SetDocumentHtmlPart = Extract<
  DocumentChatUIMessage['parts'][number],
  { type: 'tool-setDocumentHtml' }
>;

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

/**
 * Pull the final HTML output from a completed `tool-setDocumentHtml` part.
 * Returns null while the tool is still streaming or produced no HTML.
 */
export function getSetDocumentOutput(
  part: DocumentChatUIMessage['parts'][number],
): { html?: string } | null {
  if (part.type !== 'tool-setDocumentHtml') return null;
  if (part.state !== 'output-available') return null;
  const out = part.output;
  if (!isObject(out) || !('html' in out)) return null;
  const html = out.html;
  return typeof html === 'string' ? { html } : null;
}

/**
 * Strip tags and normalize whitespace. We only use this for a rough word count
 * shown on the card; the dialog renders the authoritative structured diff.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(s: string): number {
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}

function computeWordDelta(previousHtml: string | undefined, nextHtml: string) {
  const beforeWords = countWords(htmlToPlainText(previousHtml ?? ''));
  const afterWords = countWords(htmlToPlainText(nextHtml));
  const delta = afterWords - beforeWords;
  return { beforeWords, afterWords, delta };
}

export function ToolSetDocumentHtmlPart({
  part,
  previousHtml,
  canUndo,
  onUndo,
}: {
  part: SetDocumentHtmlPart;
  /** HTML captured immediately before this tool call applied its edit; used for diff + word count. */
  previousHtml?: string;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const [undone, setUndone] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);

  const nextHtml = useMemo(() => {
    const out = getSetDocumentOutput(part);
    return out?.html ?? '';
  }, [part]);

  const { delta } = useMemo(() => computeWordDelta(previousHtml, nextHtml), [previousHtml, nextHtml]);

  const canViewDiff = Boolean(nextHtml);

  if (part.state === 'output-error') {
    return (
      <div className="border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2 text-xs">
        <PenLineIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <p>The assistant tried to edit the document but something went wrong.</p>
      </div>
    );
  }

  if (part.state !== 'output-available') {
    return (
      <div className="border-border bg-muted/40 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
        <Spinner className="shrink-0" />
        <span className="text-muted-foreground">Preparing document edit…</span>
      </div>
    );
  }

  const deltaLabel =
    delta === 0
      ? 'Content updated'
      : delta > 0
        ? `+${delta} word${delta === 1 ? '' : 's'}`
        : `${delta} word${delta === -1 ? '' : 's'}`;

  return (
    <>
      <div className="border-border bg-card text-card-foreground flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm">
        <div className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-md">
          <PenLineIcon aria-hidden className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-foreground text-sm font-medium leading-tight">
              {undone ? 'Edit reverted' : 'Applied document edit'}
            </p>
            <span className="text-muted-foreground shrink-0 text-xs">{deltaLabel}</span>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
            {undone
              ? 'The document was restored to its previous state.'
              : 'The assistant rewrote the document with your requested changes.'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setDiffOpen(true)}
              disabled={!canViewDiff}
            >
              <FileDiffIcon data-icon="inline-start" aria-hidden />
              View diff
            </Button>
            {!undone ? (
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
