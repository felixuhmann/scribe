import {
  ChevronDownIcon,
  MessageSquarePlusIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { DocumentChatBundle, StoredChatSession } from '@/src/scribe-ipc-types';
import { cn } from '@/lib/utils';

import { SessionCard } from './session-card';

type SessionsRailProps = {
  bundle: DocumentChatBundle | null;
  activeSessionId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  archivedOpen: boolean;
  onArchivedOpenChange: (open: boolean) => void;

  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (session: StoredChatSession, nextTitle: string) => void;
  onArchiveToggle: (session: StoredChatSession) => void;
  onDelete: (session: StoredChatSession) => void;
};

export function SessionsRail({
  bundle,
  activeSessionId,
  collapsed,
  onToggleCollapsed,
  archivedOpen,
  onArchivedOpenChange,
  onSelect,
  onNewChat,
  onRename,
  onArchiveToggle,
  onDelete,
}: SessionsRailProps) {
  const active = bundle?.sessions.filter((s) => !s.archived) ?? [];
  const archived = bundle?.sessions.filter((s) => s.archived) ?? [];

  return (
    <aside
      className={cn(
        'border-sidebar-border/80 flex shrink-0 flex-col gap-1.5 border-r pr-2 transition-[width] duration-150',
        collapsed ? 'w-[44px]' : 'w-[216px]',
      )}
      aria-label="Chat sessions"
    >
      <div className={cn('flex items-center gap-1', collapsed ? 'flex-col' : 'flex-row')}>
        {collapsed ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Expand chat list"
                  onClick={onToggleCollapsed}
                >
                  <PanelLeftOpenIcon aria-hidden className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand chat list</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 flex-1 justify-start gap-1.5 px-2 text-xs"
              disabled={!bundle}
              onClick={onNewChat}
            >
              <MessageSquarePlusIcon data-icon="inline-start" aria-hidden />
              New chat
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Collapse chat list"
              title="Collapse"
              onClick={onToggleCollapsed}
            >
              <PanelLeftCloseIcon aria-hidden className="size-4" />
            </Button>
          </>
        )}
      </div>

      {collapsed ? (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="default"
                size="icon"
                className="size-8"
                aria-label="New chat"
                disabled={!bundle}
                onClick={onNewChat}
              >
                <MessageSquarePlusIcon aria-hidden className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New chat</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}

      <div className="text-sidebar-foreground/60 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pt-1">
        {!bundle ? (
          <p className="text-muted-foreground px-0.5 text-xs">…</p>
        ) : active.length === 0 && archived.length === 0 ? (
          collapsed ? null : (
            <p className="text-muted-foreground px-0.5 py-1 text-xs">No chats yet.</p>
          )
        ) : (
          <>
            <ul className={cn('flex flex-col gap-0.5', collapsed && 'items-center')}>
              {active.map((s) => (
                <li key={s.id} className={collapsed ? 'contents' : undefined}>
                  <SessionCard
                    session={s}
                    selected={s.id === activeSessionId}
                    collapsed={collapsed}
                    onSelect={() => onSelect(s.id)}
                    onRename={(next) => onRename(s, next)}
                    onArchiveToggle={() => onArchiveToggle(s)}
                    onDelete={() => onDelete(s)}
                  />
                </li>
              ))}
            </ul>
            {archived.length > 0 && !collapsed ? (
              <Collapsible
                open={archivedOpen}
                onOpenChange={onArchivedOpenChange}
                className="border-sidebar-border/60 group/archived mt-2 border-t pt-2"
              >
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-sidebar-foreground/70 hover:text-sidebar-foreground h-6 w-full justify-start gap-1 px-1.5 text-[10px] font-medium uppercase tracking-wide"
                  >
                    <ChevronDownIcon
                      data-icon="inline-start"
                      aria-hidden
                      className="transition-transform group-data-[state=open]/archived:rotate-180"
                    />
                    Archived · {archived.length}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="flex flex-col gap-0.5 pt-0.5">
                    {archived.map((s) => (
                      <li key={s.id}>
                        <SessionCard
                          session={s}
                          selected={s.id === activeSessionId}
                          collapsed={false}
                          onSelect={() => onSelect(s.id)}
                          onRename={(next) => onRename(s, next)}
                          onArchiveToggle={() => onArchiveToggle(s)}
                          onDelete={() => onDelete(s)}
                        />
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
