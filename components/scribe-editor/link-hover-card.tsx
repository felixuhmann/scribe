import type { Editor } from '@tiptap/core';
import { Check, Copy, ExternalLink, Link2Off, Pencil, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const HOVER_MARGIN = 10;

type LinkSnapshot = {
  href: string;
  rect: DOMRect;
  markFrom: number;
  markTo: number;
};

function getLinkRangeAt(editor: Editor, pos: number): { from: number; to: number; href: string } | null {
  const $pos = editor.state.doc.resolve(pos);
  const marks = $pos.marks();
  const linkMarkType = editor.schema.marks.link;
  if (!linkMarkType) return null;
  const linkMark = marks.find((m) => m.type.name === 'link');
  if (!linkMark) return null;

  let from = pos;
  let to = pos;
  editor.state.doc.nodesBetween(0, editor.state.doc.content.size, (node, nodePos) => {
    if (!node.isText) return true;
    const hasLink = node.marks.some(
      (m) => m.type.name === 'link' && m.attrs.href === linkMark.attrs.href,
    );
    if (!hasLink) return true;
    const start = nodePos;
    const end = nodePos + node.nodeSize;
    if (pos >= start && pos <= end) {
      from = Math.min(from, start);
      to = Math.max(to, end);
    }
    return false;
  });
  return { from, to, href: linkMark.attrs.href };
}

export function LinkHoverCard({ editor }: { editor: Editor | null }) {
  const [snapshot, setSnapshot] = useState<LinkSnapshot | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);
  const scheduleClose = useCallback(
    (delayMs = 150) => {
      cancelClose();
      closeTimerRef.current = setTimeout(() => {
        setSnapshot(null);
        setEditing(false);
        setCopied(false);
      }, delayMs);
    },
    [cancelClose],
  );

  useEffect(() => {
    if (!editor) return;

    const onOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor) return;
      const view = editor.view;
      if (!view?.dom.contains(anchor)) return;
      const pos = view.posAtDOM(anchor, 0);
      if (pos == null) return;
      const range = getLinkRangeAt(editor, pos);
      if (!range) return;
      const rect = anchor.getBoundingClientRect();
      cancelClose();
      setSnapshot({
        href: range.href,
        rect,
        markFrom: range.from,
        markTo: range.to,
      });
      setDraft(range.href);
      setEditing(false);
    };

    const onOut = (event: MouseEvent) => {
      const related = event.relatedTarget as HTMLElement | null;
      if (related && cardRef.current?.contains(related)) return;
      scheduleClose();
    };

    const dom = editor.view?.dom;
    if (!dom) return;
    dom.addEventListener('mouseover', onOver);
    dom.addEventListener('mouseout', onOut);
    return () => {
      dom.removeEventListener('mouseover', onOver);
      dom.removeEventListener('mouseout', onOut);
    };
  }, [cancelClose, editor, scheduleClose]);

  useLayoutEffect(() => {
    if (editing) {
      const id = requestAnimationFrame(() => {
        cardRef.current?.querySelector<HTMLInputElement>('input[type=url]')?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [editing]);

  useEffect(() => {
    return () => cancelClose();
  }, [cancelClose]);

  if (!snapshot || !editor) return null;

  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(snapshot.rect.bottom + HOVER_MARGIN, window.innerHeight - 120),
    left: Math.min(Math.max(snapshot.rect.left, 8), window.innerWidth - 320),
    zIndex: 70,
  };

  const updateLink = (nextHref: string) => {
    const trimmed = nextHref.trim();
    if (!trimmed) return;
    editor
      .chain()
      .focus()
      .setTextSelection({ from: snapshot.markFrom, to: snapshot.markTo })
      .extendMarkRange('link')
      .setLink({ href: trimmed })
      .run();
    setSnapshot({ ...snapshot, href: trimmed });
    setEditing(false);
  };

  const removeLink = () => {
    editor
      .chain()
      .focus()
      .setTextSelection({ from: snapshot.markFrom, to: snapshot.markTo })
      .extendMarkRange('link')
      .unsetLink()
      .run();
    setSnapshot(null);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snapshot.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      updateLink(draft);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(false);
      setDraft(snapshot.href);
    }
  };

  const openExternal = () => {
    window.open(snapshot.href, '_blank', 'noopener,noreferrer');
  };

  return createPortal(
    <div
      ref={cardRef}
      style={style}
      className={cn(
        'border-border bg-popover text-popover-foreground w-[22rem] max-w-[calc(100vw-1rem)] rounded-xl border p-2 shadow-xl',
      )}
      role="dialog"
      aria-label="Link preview"
      onMouseEnter={() => cancelClose()}
      onMouseLeave={() => scheduleClose()}
    >
      {editing ? (
        <div className="flex items-center gap-1.5">
          <Input
            type="url"
            inputMode="url"
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder="https://…"
            className="h-8 text-sm"
          />
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={() => updateLink(draft)}
            disabled={!draft.trim()}
          >
            <Check />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            onClick={() => {
              setEditing(false);
              setDraft(snapshot.href);
            }}
          >
            <X />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <a
            href={snapshot.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80 min-w-0 flex-1 truncate text-sm underline underline-offset-2"
            onClick={(e) => {
              e.preventDefault();
              openExternal();
            }}
            title={snapshot.href}
          >
            {snapshot.href.replace(/^https?:\/\//, '')}
          </a>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-1.5 text-muted-foreground"
            onClick={() => void copy()}
            aria-label="Copy link"
            title="Copy URL"
          >
            {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-1.5 text-muted-foreground"
            onClick={openExternal}
            aria-label="Open in new tab"
            title="Open"
          >
            <ExternalLink className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-1.5 text-muted-foreground"
            onClick={() => setEditing(true)}
            aria-label="Edit link"
            title="Edit URL"
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-1.5 text-destructive hover:text-destructive"
            onClick={removeLink}
            aria-label="Remove link"
            title="Remove link"
          >
            <Link2Off className="size-3.5" />
          </Button>
        </div>
      )}
    </div>,
    document.body,
  );
}
