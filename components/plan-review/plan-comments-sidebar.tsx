import { CheckCircle2Icon, MessageSquareIcon, Trash2Icon, XCircleIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { type PlanArtifact, type PlanComment } from '@/lib/plan-artifact';
import { cn } from '@/lib/utils';

import type { StagedComment } from '@/components/document-chat/use-document-chat-session';

type PlanCommentsSidebarProps = {
  artifact: PlanArtifact;
  /** Version the user is currently viewing — controls which comments are flagged "open on this version". */
  currentVersion: number;
  stagedComments: StagedComment[];
  onJumpToBlock: (blockId: string) => void;
  onRemoveStaged: (stagedId: string) => void;
};

/**
 * Right-rail list of comments for the plan-review overlay. Splits into:
 *   1) Staged (not-yet-sent) comments authored on the current version,
 *   2) Open comments authored on prior versions that still need addressing,
 *   3) Resolved/dismissed comments collapsed into a "history" affordance.
 */
export function PlanCommentsSidebar({
  artifact,
  currentVersion,
  stagedComments,
  onJumpToBlock,
  onRemoveStaged,
}: PlanCommentsSidebarProps) {
  const open: PlanComment[] = [];
  const addressed: PlanComment[] = [];
  const dismissed: PlanComment[] = [];
  for (const c of artifact.comments) {
    if (c.status.kind === 'open') open.push(c);
    else if (c.status.kind === 'addressed') addressed.push(c);
    else dismissed.push(c);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <Section
        title="Staged comments"
        subtitle="Will be sent when you click Request changes."
        empty="Highlight text in the plan or use Plan-wide comment to add one."
        count={stagedComments.length}
      >
        {stagedComments.map((c) => (
          <StagedCommentCard
            key={c.stagedId}
            comment={c}
            onJump={() => c.blockId !== 'doc' && onJumpToBlock(c.blockId)}
            onRemove={() => onRemoveStaged(c.stagedId)}
          />
        ))}
      </Section>

      {open.length > 0 ? (
        <Section
          title="Open from earlier versions"
          subtitle="The agent should still address these in the next plan revision."
          empty=""
          count={open.length}
        >
          {open.map((c) => (
            <PersistedCommentCard
              key={c.commentId}
              comment={c}
              currentVersion={currentVersion}
              onJump={() => c.blockId !== 'doc' && onJumpToBlock(c.blockId)}
            />
          ))}
        </Section>
      ) : null}

      {addressed.length > 0 ? (
        <Section
          title="Addressed"
          subtitle="Marked resolved in a later plan version."
          empty=""
          count={addressed.length}
          dim
        >
          {addressed.map((c) => (
            <PersistedCommentCard
              key={c.commentId}
              comment={c}
              currentVersion={currentVersion}
              onJump={() => c.blockId !== 'doc' && onJumpToBlock(c.blockId)}
              dim
            />
          ))}
        </Section>
      ) : null}

      {dismissed.length > 0 ? (
        <Section title="Dismissed" subtitle="" empty="" count={dismissed.length} dim>
          {dismissed.map((c) => (
            <PersistedCommentCard
              key={c.commentId}
              comment={c}
              currentVersion={currentVersion}
              onJump={() => c.blockId !== 'doc' && onJumpToBlock(c.blockId)}
              dim
            />
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function Section({
  title,
  subtitle,
  empty,
  count,
  dim,
  children,
}: {
  title: string;
  subtitle: string;
  empty: string;
  count: number;
  dim?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', dim && 'opacity-80')}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-foreground text-[11px] font-semibold uppercase tracking-wide">
          {title}{' '}
          <span className="text-muted-foreground font-normal normal-case">({count})</span>
        </h3>
      </div>
      {subtitle ? <p className="text-muted-foreground text-[11px]">{subtitle}</p> : null}
      <div className="flex flex-col gap-1.5">
        {count === 0 && empty ? (
          <p className="text-muted-foreground bg-muted/30 rounded-md px-2 py-1.5 text-xs italic">
            {empty}
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function StagedCommentCard({
  comment,
  onJump,
  onRemove,
}: {
  comment: StagedComment;
  onJump: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="border-amber-500/30 bg-amber-500/[0.04] flex flex-col gap-1.5 rounded-md border p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-amber-700 dark:text-amber-300 text-[10px] font-semibold uppercase tracking-wide">
            <MessageSquareIcon
              aria-hidden
              className="mr-0.5 inline size-2.5 align-[-2px]"
            />
            Staged
            {comment.blockId !== 'doc' ? (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={onJump}
                  className="hover:underline"
                  title={`Jump to ${comment.blockId}`}
                >
                  block {comment.blockId}
                </button>
              </>
            ) : (
              ' · plan-wide'
            )}
          </p>
          {comment.selectionText ? (
            <p className="text-muted-foreground border-l-amber-500/40 border-l-2 pl-1.5 text-[11px] italic line-clamp-2">
              “{comment.selectionText}”
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-destructive"
          aria-label="Remove staged comment"
          onClick={onRemove}
        >
          <Trash2Icon aria-hidden />
        </Button>
      </div>
      <p className="text-foreground text-xs leading-snug">{comment.body}</p>
    </div>
  );
}

function PersistedCommentCard({
  comment,
  currentVersion,
  onJump,
  dim,
}: {
  comment: PlanComment;
  currentVersion: number;
  onJump: () => void;
  dim?: boolean;
}) {
  const status = comment.status;
  const StatusIcon =
    status.kind === 'addressed'
      ? CheckCircle2Icon
      : status.kind === 'dismissed'
        ? XCircleIcon
        : MessageSquareIcon;
  const statusLabel =
    status.kind === 'addressed'
      ? `addressed in v${status.inVersion}`
      : status.kind === 'dismissed'
        ? 'dismissed'
        : `open · authored on v${comment.versionNumber}${
            comment.versionNumber === currentVersion ? ' (current)' : ''
          }`;
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-md border p-2',
        status.kind === 'open'
          ? 'border-primary/30 bg-primary/5'
          : 'border-border bg-muted/20',
        dim && 'opacity-70',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
          <StatusIcon aria-hidden className="mr-0.5 inline size-2.5 align-[-2px]" />
          {statusLabel}
          {comment.blockId !== 'doc' ? (
            <>
              {' · '}
              <button
                type="button"
                onClick={onJump}
                className="hover:underline"
                title={`Jump to ${comment.blockId}`}
              >
                block {comment.blockId}
              </button>
            </>
          ) : (
            ' · plan-wide'
          )}
        </p>
      </div>
      {comment.selectionText ? (
        <p className="text-muted-foreground border-l-primary/40 border-l-2 pl-1.5 text-[11px] italic line-clamp-2">
          “{comment.selectionText}”
        </p>
      ) : null}
      <p className="text-foreground text-xs leading-snug">{comment.body}</p>
    </div>
  );
}
