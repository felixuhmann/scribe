import { Dialog as DialogPrimitive } from 'radix-ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightIcon, MessageSquarePlusIcon, SendIcon, XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  diffPlanBlocks,
  getPlanVersion,
  type PlanArtifact,
  type PlanBlockDiff,
} from '@/lib/plan-artifact';

import type { StagedComment } from '@/components/document-chat/use-document-chat-session';

import { PlanCommentsSidebar } from './plan-comments-sidebar';
import { PlanContent } from './plan-content';
import { PlanVersionSwitcher } from './plan-version-switcher';

export type PlanReviewOverlayProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artifact: PlanArtifact;
  busy: boolean;
  stagedComments: StagedComment[];
  freeformFeedback: string;
  onChangeFreeformFeedback: (next: string) => void;
  onAddComment: (input: { blockId: string | 'doc'; selectionText?: string; body: string }) => void;
  onRemoveStagedComment: (stagedId: string) => void;
  onSetCurrentVersion: (versionNumber: number) => void;
  onRequestChanges: () => void;
  onSubmitPlan: () => void;
};

/**
 * Full-tab plan review overlay. Layout:
 *
 *   ┌─ Header: "Plan vN" · version switcher · diff toggle · close ─┐
 *   │ ┌─ Content (centered, max-readable) ─┐ ┌─ Comments rail ─┐  │
 *   │ │ blocks with markers + selection    │ │ staged + open   │  │
 *   │ │ comment popover                    │ │ comments        │  │
 *   │ └───────────────────────────────────┘ └─────────────────┘  │
 *   └─ Footer: freeform note · Request changes · Submit plan ────┘
 */
export function PlanReviewOverlay({
  open,
  onOpenChange,
  artifact,
  busy,
  stagedComments,
  freeformFeedback,
  onChangeFreeformFeedback,
  onAddComment,
  onRemoveStagedComment,
  onSetCurrentVersion,
  onRequestChanges,
  onSubmitPlan,
}: PlanReviewOverlayProps) {
  const totalVersions = artifact.versions.length;
  const currentVersion = artifact.currentVersion;
  const [diffEnabled, setDiffEnabled] = useState(false);
  const [highlightedBlockId, setHighlightedBlockId] = useState<string | null>(null);

  const isHistorical =
    artifact.status === 'accepted' || artifact.status === 'superseded';
  const isLatestVersion = currentVersion === totalVersions;
  /** The user can only request changes / submit on the latest version while review is open. */
  const readOnly = isHistorical || !isLatestVersion;

  const version = useMemo(() => getPlanVersion(artifact, currentVersion), [
    artifact,
    currentVersion,
  ]);

  const diff: PlanBlockDiff | null = useMemo(() => {
    if (!diffEnabled || !version || currentVersion <= 1) return null;
    const prev = getPlanVersion(artifact, currentVersion - 1);
    if (!prev) return null;
    return diffPlanBlocks(prev.blocks, version.blocks);
  }, [artifact, currentVersion, diffEnabled, version]);

  const blockIdsWithOpenComments = useMemo(() => {
    const set = new Set<string>();
    for (const c of artifact.comments) {
      if (c.status.kind !== 'open') continue;
      if (c.blockId === 'doc') continue;
      set.add(c.blockId);
    }
    return set;
  }, [artifact.comments]);

  const blockIdsWithStagedComments = useMemo(() => {
    const set = new Set<string>();
    for (const c of stagedComments) {
      if (c.blockId === 'doc') continue;
      set.add(c.blockId);
    }
    return set;
  }, [stagedComments]);

  const canRequestChanges =
    !busy &&
    !readOnly &&
    (stagedComments.length > 0 || freeformFeedback.trim().length > 0);
  const canSubmit = !busy && !readOnly;

  /** Keyboard shortcuts within the overlay: cmd+enter submits, esc closes. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (canSubmit) {
          e.preventDefault();
          onSubmitPlan();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canSubmit, onSubmitPlan, open]);

  const handleAddComment = useCallback(
    (input: { blockId: string; selectionText: string; body: string }) => {
      onAddComment({
        blockId: input.blockId,
        selectionText: input.selectionText,
        body: input.body,
      });
    },
    [onAddComment],
  );

  const handleWholePlanComment = useCallback(
    (body: string) => {
      onAddComment({ blockId: 'doc', body });
    },
    [onAddComment],
  );

  const handleJumpToBlock = useCallback((blockId: string) => {
    setHighlightedBlockId(blockId);
    /** Clear the highlight shortly after, so the ring isn't sticky. */
    window.setTimeout(() => setHighlightedBlockId(null), 1600);
  }, []);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="plan-review-overlay-bg"
          className="bg-background/70 fixed inset-0 z-50 supports-backdrop-filter:backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        />
        <DialogPrimitive.Content
          data-slot="plan-review-overlay"
          className="bg-background ring-foreground/10 fixed inset-2 z-50 flex flex-col overflow-hidden rounded-xl shadow-2xl ring-1 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.99] data-closed:animate-out data-closed:fade-out-0"
        >
          {/* Header */}
          <header className="border-border bg-card/40 flex shrink-0 items-center gap-3 border-b px-4 py-2.5">
            <div className="flex min-w-0 items-baseline gap-2">
              <DialogPrimitive.Title className="text-foreground text-sm font-semibold">
                Plan review
              </DialogPrimitive.Title>
              <p className="text-muted-foreground truncate text-xs">
                {totalVersions === 0
                  ? 'No version yet'
                  : `${version?.blocks.length ?? 0} blocks · ${
                      artifact.comments.filter((c) => c.status.kind === 'open').length
                    } open comments`}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <PlanVersionSwitcher
                totalVersions={totalVersions}
                currentVersion={currentVersion}
                onChange={onSetCurrentVersion}
                diffEnabled={diffEnabled}
                onToggleDiff={setDiffEnabled}
              />
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close plan review">
                  <XIcon aria-hidden />
                </Button>
              </DialogPrimitive.Close>
            </div>
          </header>

          {/* Status banners */}
          {readOnly ? (
            <div
              className={cn(
                'border-border flex shrink-0 items-center gap-2 border-b px-4 py-1.5 text-xs',
                isHistorical
                  ? 'bg-muted/40 text-muted-foreground'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
              )}
            >
              <span className="font-medium">
                {isHistorical
                  ? artifact.status === 'accepted'
                    ? 'Accepted — viewing read-only.'
                    : 'Superseded — this plan has been applied to the document.'
                  : `Viewing v${currentVersion} (read-only). Switch to v${totalVersions} to comment.`}
              </span>
              {!isLatestVersion ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="h-6 ml-auto"
                  onClick={() => onSetCurrentVersion(totalVersions)}
                >
                  Go to v{totalVersions}
                  <ArrowRightIcon data-icon="inline-end" aria-hidden />
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* Body: content + comments rail */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl px-6 py-6">
                {version ? (
                  <>
                    {version.rationale ? (
                      <div className="border-primary/20 bg-primary/5 mb-5 rounded-md border-l-2 px-3 py-2 text-xs italic">
                        <span className="text-muted-foreground mr-1 font-semibold not-italic">
                          v{version.versionNumber} rationale:
                        </span>
                        {version.rationale}
                      </div>
                    ) : null}
                    <PlanContent
                      blocks={version.blocks}
                      blockIdsWithOpenComments={blockIdsWithOpenComments}
                      blockIdsWithStagedComments={blockIdsWithStagedComments}
                      diff={diff}
                      highlightedBlockId={highlightedBlockId}
                      readOnly={readOnly}
                      onAddComment={handleAddComment}
                      onWholePlanComment={handleWholePlanComment}
                    />
                  </>
                ) : (
                  <p className="text-muted-foreground py-12 text-center text-sm">
                    No plan version available.
                  </p>
                )}
              </div>
            </div>
            <aside className="border-border bg-card/30 hidden w-[22rem] shrink-0 border-l md:flex md:flex-col">
              <PlanCommentsSidebar
                artifact={artifact}
                currentVersion={currentVersion}
                stagedComments={stagedComments}
                onJumpToBlock={handleJumpToBlock}
                onRemoveStaged={onRemoveStagedComment}
              />
            </aside>
          </div>

          {/* Footer: freeform note + actions */}
          <footer className="border-border bg-card/40 flex shrink-0 flex-col gap-2 border-t px-4 py-3">
            {!readOnly ? (
              <div className="flex items-start gap-2">
                <MessageSquarePlusIcon
                  aria-hidden
                  className="text-muted-foreground mt-1.5 size-3.5 shrink-0"
                />
                <textarea
                  value={freeformFeedback}
                  onChange={(e) => onChangeFreeformFeedback(e.target.value)}
                  placeholder="Optional: high-level note to the agent (sent with Request changes)."
                  rows={1}
                  className="border-input bg-background min-h-[28px] flex-1 resize-y rounded-md border px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs">
                {readOnly
                  ? '⌘+Enter submits · Esc closes'
                  : `${stagedComments.length} staged comment${
                      stagedComments.length === 1 ? '' : 's'
                    } · ⌘+Enter submits · Esc closes`}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canRequestChanges}
                  onClick={onRequestChanges}
                  title={
                    canRequestChanges
                      ? 'Send staged comments and notes back to the agent'
                      : 'Add a comment or note first'
                  }
                >
                  <SendIcon data-icon="inline-start" aria-hidden />
                  Request changes
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!canSubmit}
                  onClick={onSubmitPlan}
                  title="Accept the current plan and execute it"
                >
                  Submit plan
                  <ArrowRightIcon data-icon="inline-end" aria-hidden />
                </Button>
              </div>
            </div>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
