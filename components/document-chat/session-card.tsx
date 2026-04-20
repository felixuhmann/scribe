import { useEffect, useRef, useState } from 'react';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  MessageSquareIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { DocumentChatUIMessage } from '@/lib/agents/document-chat-agent';
import type { StoredChatSession } from '@/src/scribe-ipc-types';
import { cn } from '@/lib/utils';

import { formatRelativeShort } from './relative-time';

type SessionCardProps = {
  session: StoredChatSession;
  selected: boolean;
  collapsed: boolean;
  onSelect: () => void;
  onRename: (nextTitle: string) => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
};

/** Best-effort snippet from the first user text message, minus SCRIBE_PLAN_ANSWERS payloads. */
function snippetFromSession(session: StoredChatSession): string {
  const msgs = session.messages as DocumentChatUIMessage[] | undefined;
  if (!Array.isArray(msgs)) return '';
  for (const m of msgs) {
    if (!m || m.role !== 'user') continue;
    if (!Array.isArray(m.parts)) continue;
    for (const p of m.parts) {
      if (!p || p.type !== 'text') continue;
      const t = typeof p.text === 'string' ? p.text.trim() : '';
      if (!t) continue;
      if (t.startsWith('[SCRIBE_PLAN_ANSWERS]')) continue;
      return t.replace(/\s+/g, ' ');
    }
  }
  return '';
}

export function SessionCard({
  session,
  selected,
  collapsed,
  onSelect,
  onRename,
  onArchiveToggle,
  onDelete,
}: SessionCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(session.title);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraftTitle(session.title);
  }, [editing, session.title]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitRename = () => {
    const next = draftTitle.trim();
    setEditing(false);
    if (next && next !== session.title) {
      onRename(next);
    } else {
      setDraftTitle(session.title);
    }
  };

  const snippet = snippetFromSession(session);
  const relative = formatRelativeShort(session.updatedAt);
  const archived = session.archived === true;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onSelect}
        title={session.title}
        aria-label={session.title}
        className={cn(
          'relative flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60',
          selected && 'bg-sidebar-accent text-sidebar-accent-foreground',
          archived && !selected && 'opacity-60',
        )}
      >
        <MessageSquareIcon className="size-3.5" aria-hidden />
      </button>
    );
  }

  return (
    <>
      <div
        className={cn(
          'group/session relative flex flex-col gap-0.5 rounded-md px-2 py-1.5',
          selected
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'hover:bg-sidebar-accent/50 text-sidebar-foreground/90',
          archived && 'opacity-80',
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          className="flex flex-col gap-0.5 text-left"
          disabled={editing}
        >
          <div className="flex items-baseline justify-between gap-2">
            {editing ? (
              <input
                ref={inputRef}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitRename();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setEditing(false);
                    setDraftTitle(session.title);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="border-input bg-background focus-visible:ring-ring h-6 w-full min-w-0 rounded border px-1 text-xs focus-visible:ring-2 focus-visible:outline-none"
              />
            ) : (
              <span className="line-clamp-1 text-xs font-medium">{session.title}</span>
            )}
            {!editing ? (
              <span className="text-muted-foreground group-hover/session:opacity-0 shrink-0 text-[10px]">
                {relative}
              </span>
            ) : null}
          </div>
          {!editing && snippet ? (
            <span className="text-muted-foreground line-clamp-1 text-[11px] leading-snug">
              {snippet}
            </span>
          ) : null}
        </button>

        {!editing ? (
          <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/session:opacity-100 focus-within:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground size-6"
              title="Rename"
              aria-label="Rename chat"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
            >
              <PencilIcon aria-hidden className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground size-6"
              title={archived ? 'Restore' : 'Archive'}
              aria-label={archived ? 'Restore chat' : 'Archive chat'}
              onClick={(e) => {
                e.stopPropagation();
                onArchiveToggle();
              }}
            >
              {archived ? (
                <ArchiveRestoreIcon aria-hidden className="size-3" />
              ) : (
                <ArchiveIcon aria-hidden className="size-3" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive size-6"
              title="Delete"
              aria-label="Delete chat"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDeleteOpen(true);
              }}
            >
              <Trash2Icon aria-hidden className="size-3" />
            </Button>
          </div>
        ) : null}
      </div>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the conversation. Archive it instead if you want to restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDeleteOpen(false);
                onDelete();
              }}
            >
              Delete chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
