import { useEffect, useRef, useState } from 'react';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  MoreHorizontalIcon,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { StoredChatSession } from '@/src/scribe-ipc-types';
import { cn } from '@/lib/utils';

import { formatRelativeShort } from './relative-time';

type ChatHeaderProps = {
  documentLabel: string;
  documentKey: string;
  activeSession: StoredChatSession | undefined;
  onRenameActive: (nextTitle: string) => void;
  onArchiveActive: () => void;
  onUnarchiveActive: () => void;
  onDeleteActive: () => void;
};

export function ChatHeader({
  documentLabel,
  documentKey,
  activeSession,
  onRenameActive,
  onArchiveActive,
  onUnarchiveActive,
  onDeleteActive,
}: ChatHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(activeSession?.title ?? '');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(activeSession?.title ?? '');
  }, [editing, activeSession?.title]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && activeSession && next !== activeSession.title) {
      onRenameActive(next);
    } else {
      setDraft(activeSession?.title ?? '');
    }
  };

  const archived = activeSession?.archived === true;

  return (
    <>
      <div className="flex items-start gap-2 px-0.5">
        <div className="min-w-0 flex-1">
          <TooltipProvider delayDuration={400}>
            <Tooltip>
              <TooltipTrigger asChild>
                <p
                  className="text-sidebar-foreground/90 truncate text-sm font-medium"
                  aria-label={documentKey}
                >
                  {documentLabel}
                </p>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start">
                <span className="text-xs">{documentKey}</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {activeSession ? (
            <div className="mt-0.5 flex items-center gap-1.5">
              {editing ? (
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commit();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditing(false);
                      setDraft(activeSession.title);
                    }
                  }}
                  className="border-input bg-background focus-visible:ring-ring h-6 min-w-0 flex-1 rounded border px-1 text-xs focus-visible:ring-2 focus-visible:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className={cn(
                    'text-muted-foreground hover:text-foreground truncate rounded px-0.5 text-xs',
                    archived && 'italic',
                  )}
                  title="Rename chat"
                >
                  {activeSession.title}
                </button>
              )}
              <span className="text-muted-foreground shrink-0 text-[10px]">
                · {formatRelativeShort(activeSession.updatedAt)}
              </span>
              {archived ? (
                <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase">
                  Archived
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {activeSession ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-sidebar-foreground/70 hover:text-sidebar-foreground size-7 shrink-0"
                aria-label="Chat actions"
                title="Chat actions"
              >
                <MoreHorizontalIcon aria-hidden className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuGroup>
                {archived ? (
                  <DropdownMenuItem onSelect={onUnarchiveActive}>
                    <ArchiveRestoreIcon aria-hidden />
                    Restore
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={onArchiveActive}>
                    <ArchiveIcon aria-hidden />
                    Archive
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(e) => {
                    e.preventDefault();
                    setConfirmDeleteOpen(true);
                  }}
                >
                  <Trash2Icon aria-hidden />
                  Delete chat
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
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
                onDeleteActive();
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
