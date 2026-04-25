import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquarePlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  type PlanBlock,
  type PlanBlockDiff,
} from '@/lib/plan-artifact';
import { cn } from '@/lib/utils';

type PendingSelection = {
  blockId: string;
  selectionText: string;
  /** Anchor rect in viewport coords for floating the popover. */
  anchorRect: DOMRect;
};

type PlanContentProps = {
  blocks: PlanBlock[];
  /** Block ids that have at least one open comment — get a left-edge marker. */
  blockIdsWithOpenComments: Set<string>;
  /** Block ids that have at least one staged (not-yet-sent) comment. */
  blockIdsWithStagedComments: Set<string>;
  /** Diff vs previous version (null on v1). */
  diff: PlanBlockDiff | null;
  /** Highlight a single block (e.g. "jump to block" from sidebar). */
  highlightedBlockId?: string | null;
  /** Read-only renderings disable selection-to-comment. */
  readOnly?: boolean;
  onAddComment: (input: { blockId: string; selectionText: string; body: string }) => void;
  onWholePlanComment: (body: string) => void;
};

/**
 * Renders the plan blocks with stable `data-block-id` anchors and a floating
 * "Comment" popover that appears on text selection inside a block. Selections
 * spanning multiple blocks are anchored to the first block (selection text is
 * captured verbatim for context).
 */
export function PlanContent({
  blocks,
  blockIdsWithOpenComments,
  blockIdsWithStagedComments,
  diff,
  highlightedBlockId,
  readOnly,
  onAddComment,
  onWholePlanComment,
}: PlanContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  /** Used by the selection-end listener to ignore events fired inside the popover/inline editors. */
  const popoverRef = useRef<HTMLDivElement>(null);
  const wholePlanRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [body, setBody] = useState('');
  const [wholePlanOpen, setWholePlanOpen] = useState(false);
  const [wholePlanBody, setWholePlanBody] = useState('');

  /** Scroll a block into view when the sidebar tells us to focus it. */
  useEffect(() => {
    if (!highlightedBlockId) return;
    const root = containerRef.current;
    if (!root) return;
    const el = root.querySelector(
      `[data-block-id="${CSS.escape(highlightedBlockId)}"]`,
    ) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedBlockId]);

  /**
   * Track the current text selection: when the user releases the mouse, if a
   * non-empty selection sits inside a `[data-block-id]` element, surface the
   * comment popover anchored at the selection's bounding rect.
   *
   * Events that originate inside the popover or the plan-wide comment box must
   * be ignored — typing or clicking in the textarea collapses the document
   * selection, which would otherwise dismiss the popover from under the user.
   */
  const handleSelectionEnd = useCallback(
    (e: Event) => {
      if (readOnly) return;
      const target = e.target as Node | null;
      if (target && popoverRef.current && popoverRef.current.contains(target)) {
        return;
      }
      if (target && wholePlanRef.current && wholePlanRef.current.contains(target)) {
        return;
      }
      const root = containerRef.current;
      if (!root) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        /** Don't dismiss while a popover is already open — the user is typing in it. */
        if (!popoverRef.current) setPending(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const text = sel.toString().trim();
      if (text.length === 0) {
        if (!popoverRef.current) setPending(null);
        return;
      }
      let node: Node | null = range.startContainer;
      while (node && node !== root) {
        if (node instanceof HTMLElement && node.dataset.blockId) {
          const rect = range.getBoundingClientRect();
          setPending({
            blockId: node.dataset.blockId,
            selectionText: text.slice(0, 280),
            anchorRect: rect,
          });
          return;
        }
        node = node.parentNode;
      }
      /** Selection lives outside any block (and not in the popover) — clear. */
      if (!popoverRef.current) setPending(null);
    },
    [readOnly],
  );

  useEffect(() => {
    document.addEventListener('mouseup', handleSelectionEnd);
    document.addEventListener('keyup', handleSelectionEnd);
    return () => {
      document.removeEventListener('mouseup', handleSelectionEnd);
      document.removeEventListener('keyup', handleSelectionEnd);
    };
  }, [handleSelectionEnd]);

  const submitPending = useCallback(() => {
    if (!pending) return;
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    onAddComment({
      blockId: pending.blockId,
      selectionText: pending.selectionText,
      body: trimmed,
    });
    setBody('');
    setPending(null);
    window.getSelection()?.removeAllRanges();
  }, [body, onAddComment, pending]);

  const submitWholePlan = useCallback(() => {
    const trimmed = wholePlanBody.trim();
    if (trimmed.length === 0) return;
    onWholePlanComment(trimmed);
    setWholePlanBody('');
    setWholePlanOpen(false);
  }, [onWholePlanComment, wholePlanBody]);

  const renderedBlocks = useMemo(
    () =>
      blocks.map((b) => {
        const hasOpen = blockIdsWithOpenComments.has(b.id);
        const hasStaged = blockIdsWithStagedComments.has(b.id);
        const diffClass = diff
          ? diff.added.has(b.id)
            ? 'border-l-emerald-500 bg-emerald-500/[0.04]'
            : diff.edited.has(b.id)
              ? 'border-l-amber-500 bg-amber-500/[0.04]'
              : 'border-l-transparent'
          : 'border-l-transparent';
        const baseClasses = cn(
          'group/block relative -ml-3 rounded-md border-l-2 pr-1 pl-3 py-0.5 transition-colors',
          diffClass,
          highlightedBlockId === b.id && 'bg-primary/5 ring-2 ring-primary/30',
        );
        const marker = (
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute top-1.5 -left-2 size-2 rounded-full transition-opacity',
              hasStaged
                ? 'bg-amber-500 opacity-100'
                : hasOpen
                  ? 'bg-primary opacity-100'
                  : 'opacity-0',
            )}
          />
        );
        const common = { 'data-block-id': b.id } as const;
        if (b.kind === 'heading') {
          const Tag = (b.level === 1 ? 'h1' : b.level === 2 ? 'h2' : 'h3') as
            | 'h1'
            | 'h2'
            | 'h3';
          const sizes =
            b.level === 1
              ? 'text-2xl font-semibold tracking-tight'
              : b.level === 2
                ? 'text-xl font-semibold tracking-tight mt-4'
                : 'text-base font-semibold tracking-tight mt-3';
          /** Voice & style is a structural section the agent always writes first — flag it. */
          const isStyleSection = b.level === 1 && b.id === 'style';
          return (
            <div key={b.id} className={baseClasses}>
              {marker}
              <Tag
                {...common}
                className={cn(sizes, 'text-foreground leading-snug flex items-center gap-2 flex-wrap')}
              >
                <span>{b.text}</span>
                {isStyleSection ? (
                  <span
                    aria-label="Voice and style section"
                    className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider"
                  >
                    Style
                  </span>
                ) : null}
              </Tag>
            </div>
          );
        }
        if (b.kind === 'paragraph') {
          return (
            <div key={b.id} className={baseClasses}>
              {marker}
              <p {...common} className="text-foreground/90 text-[0.95rem] leading-relaxed">
                {b.text}
              </p>
            </div>
          );
        }
        const bullet = b.kind === 'bullet' ? '•' : `${b.id.slice(-1)}.`;
        return (
          <div key={b.id} className={baseClasses}>
            {marker}
            <div
              {...common}
              className="text-foreground/90 flex items-baseline gap-2 text-[0.95rem] leading-relaxed"
            >
              <span aria-hidden className="text-muted-foreground select-none">
                {bullet}
              </span>
              <span className="min-w-0">{b.text}</span>
            </div>
          </div>
        );
      }),
    [blocks, blockIdsWithOpenComments, blockIdsWithStagedComments, diff, highlightedBlockId],
  );

  return (
    <div className="relative">
      <div ref={containerRef} className="flex flex-col gap-2 pl-2 pr-2">
        {renderedBlocks}
      </div>

      {!readOnly ? (
        <div className="border-border mt-6 flex items-center justify-between gap-2 border-t pt-3 pl-2">
          <p className="text-muted-foreground text-xs">
            Highlight any text in the plan to comment on it.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setWholePlanOpen((v) => !v)}
          >
            <MessageSquarePlusIcon data-icon="inline-start" aria-hidden />
            Plan-wide comment
          </Button>
        </div>
      ) : null}

      {wholePlanOpen ? (
        <div
          ref={wholePlanRef}
          className="border-border bg-card mt-2 flex flex-col gap-2 rounded-md border p-2"
        >
          <WholePlanTextarea
            value={wholePlanBody}
            onChange={setWholePlanBody}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setWholePlanOpen(false);
                setWholePlanBody('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={submitWholePlan}
              disabled={wholePlanBody.trim().length === 0}
            >
              Save comment
            </Button>
          </div>
        </div>
      ) : null}

      {pending ? (
        <FloatingCommentPopover
          ref={popoverRef}
          anchorRect={pending.anchorRect}
          selectionText={pending.selectionText}
          body={body}
          onBodyChange={setBody}
          onCancel={() => {
            setBody('');
            setPending(null);
            window.getSelection()?.removeAllRanges();
          }}
          onSave={submitPending}
        />
      ) : null}
    </div>
  );
}

/** Auto-focuses on mount only, so re-renders during typing don't reset the cursor. */
function WholePlanTextarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="What should change about the plan as a whole?"
      className="border-input bg-background min-h-[60px] resize-y rounded-md border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

type FloatingCommentPopoverProps = {
  anchorRect: DOMRect;
  selectionText: string;
  body: string;
  onBodyChange: (next: string) => void;
  onCancel: () => void;
  onSave: () => void;
  ref?: React.Ref<HTMLDivElement>;
};

function FloatingCommentPopover({
  anchorRect,
  selectionText,
  body,
  onBodyChange,
  onCancel,
  onSave,
  ref,
}: FloatingCommentPopoverProps) {
  /**
   * Position the popover below the selection by default; flip above when there
   * is not enough room. We use viewport coordinates with `position: fixed`.
   */
  const top = anchorRect.bottom + 8;
  const left = Math.min(
    Math.max(anchorRect.left, 16),
    window.innerWidth - 320 - 16,
  );
  const flipped = top + 220 > window.innerHeight;
  const finalTop = flipped ? Math.max(anchorRect.top - 220, 16) : top;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Add comment"
      style={{ position: 'fixed', top: finalTop, left }}
      className="bg-popover text-popover-foreground z-50 flex w-[20rem] flex-col gap-2 rounded-lg p-2.5 text-sm shadow-lg ring-1 ring-foreground/10"
    >
      <p className="border-l-primary/40 text-muted-foreground border-l-2 pl-2 text-xs italic line-clamp-2">
        “{selectionText}”
      </p>
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        placeholder="What should change here?"
        className="border-input bg-background min-h-[60px] resize-y rounded-md border px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            onSave();
          }
        }}
      />
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={onSave} disabled={body.trim().length === 0}>
          Save comment
        </Button>
      </div>
    </div>
  );
}
