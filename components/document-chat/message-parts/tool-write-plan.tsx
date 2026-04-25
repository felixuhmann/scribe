import { ClipboardListIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';
import type { PlanBlock } from '@/lib/plan-artifact';

type WritePlanPart = Extract<
  DocumentChatUIMessage['parts'][number],
  { type: 'tool-writePlan' }
>;

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

/** Pull blocks + rationale from a completed `tool-writePlan` part, or null while streaming. */
export function getWritePlanOutput(
  part: DocumentChatUIMessage['parts'][number],
): { blocks: PlanBlock[]; rationale?: string } | null {
  if (part.type !== 'tool-writePlan') return null;
  if (part.state !== 'output-available') return null;
  const out = part.output;
  if (!isObject(out) || !Array.isArray(out.blocks)) return null;
  return {
    blocks: out.blocks as PlanBlock[],
    rationale:
      typeof out.rationale === 'string' && out.rationale.length > 0 ? out.rationale : undefined,
  };
}

/**
 * Compact bubble shown after the agent calls `writePlan`. Only the LATEST plan
 * tool call (highest version) is interactive; older versions render a smaller
 * historical chip so the user can still navigate to that version in the overlay.
 */
export function ToolWritePlanPart({
  part,
  versionNumber,
  isLatest,
  onOpenPlan,
  onSkipReview,
  canAct,
}: {
  part: WritePlanPart;
  /** 1-based version number for this tool call (derived from message order). */
  versionNumber: number;
  /** Whether this is the latest plan call in the message stream. */
  isLatest: boolean;
  onOpenPlan: () => void;
  /** "Skip review, just write" escape hatch — only shown on latest plan. */
  onSkipReview: () => void;
  canAct: boolean;
}) {
  if (part.state === 'output-error') {
    return (
      <div className="border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2 text-xs">
        <ClipboardListIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <p>The assistant tried to write a plan but something went wrong.</p>
      </div>
    );
  }

  if (part.state !== 'output-available') {
    return (
      <div className="border-border bg-muted/40 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
        <Spinner className="shrink-0" />
        <span className="text-muted-foreground">Writing plan…</span>
      </div>
    );
  }

  const out = getWritePlanOutput(part);
  const blockCount = out?.blocks.length ?? 0;

  if (!isLatest) {
    return (
      <button
        type="button"
        onClick={onOpenPlan}
        className="border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted/40 mt-2 flex w-full items-center gap-2 rounded-md border px-2 py-1 text-left text-[11px] transition-colors"
      >
        <ClipboardListIcon aria-hidden className="size-3" />
        Plan v{versionNumber} · {blockCount} section{blockCount === 1 ? '' : 's'} (open)
      </button>
    );
  }

  return (
    <div className="border-primary/30 bg-primary/5 text-card-foreground mt-2 flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm">
      <div className="bg-primary/15 text-primary flex size-7 shrink-0 items-center justify-center rounded-md">
        <ClipboardListIcon aria-hidden className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-foreground text-sm font-medium leading-tight">
            Plan v{versionNumber} ready
          </p>
          <span className="text-muted-foreground shrink-0 text-xs">
            {blockCount} section{blockCount === 1 ? '' : 's'}
          </span>
        </div>
        {out?.rationale ? (
          <p className="text-muted-foreground mt-0.5 text-xs leading-snug">{out.rationale}</p>
        ) : (
          <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
            Review the outline, leave comments on anything you want changed, then submit.
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Button
            type="button"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={onOpenPlan}
            disabled={!canAct}
          >
            <ClipboardListIcon data-icon="inline-start" aria-hidden />
            Open plan
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onSkipReview}
            disabled={!canAct}
            title="Skip review and write the document now"
          >
            Skip review
          </Button>
        </div>
      </div>
    </div>
  );
}
