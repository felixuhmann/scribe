import {
  ChevronDownIcon,
  ChevronsDownUpIcon,
  CopyIcon,
  FilePlusIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  ShareIcon,
} from 'lucide-react';
import { useCallback } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
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
import { cn } from '@/lib/utils';

import { ExplorerSearchInput } from './search-input';

type ExplorerHeaderProps = {
  rootPath: string;
  query: string;
  onQueryChange: (q: string) => void;
  onSearchArrowDown?: () => void;
  onRefresh: () => void;
  onCollapseAll: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRevealRoot: () => void;
  onCopyRootPath: () => void;
  onOpenDifferentFolder: () => void;
  refreshing?: boolean;
};

function basenameFromAbsolutePath(p: string): string {
  const normalized = p.replace(/[/\\]+$/, '');
  const i = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (i < 0) return normalized;
  const tail = normalized.slice(i + 1);
  return tail || normalized;
}

type ToolbarButtonProps = {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'default' | 'muted';
  disabled?: boolean;
};

function ToolbarButton({ label, onClick, children, disabled }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-md text-sidebar-foreground/65 transition-colors',
            'hover:bg-sidebar-accent hover:text-sidebar-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60',
            'disabled:pointer-events-none disabled:opacity-40',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function ExplorerHeader({
  rootPath,
  query,
  onQueryChange,
  onSearchArrowDown,
  onRefresh,
  onCollapseAll,
  onNewFile,
  onNewFolder,
  onRevealRoot,
  onCopyRootPath,
  onOpenDifferentFolder,
  refreshing,
}: ExplorerHeaderProps) {
  const folderName = basenameFromAbsolutePath(rootPath);
  const handleCopyPath = useCallback(() => {
    onCopyRootPath();
  }, [onCopyRootPath]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="sticky top-0 z-10 flex flex-col gap-1.5 border-b border-sidebar-border/60 bg-sidebar px-2 pb-2 pt-1.5">
        <div className="flex items-center gap-1 pl-0.5">
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'group/header flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-1 text-left',
                      'text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60',
                    )}
                    aria-label="Workspace folder actions"
                  >
                    <span className="truncate text-[12px] font-semibold uppercase tracking-[0.04em]">
                      {folderName}
                    </span>
                    <ChevronDownIcon
                      aria-hidden
                      className="size-3 shrink-0 text-sidebar-foreground/50 transition-transform group-data-[state=open]/header:rotate-180 motion-reduce:transition-none"
                    />
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start">
                <span className="font-mono text-[10.5px]">{rootPath}</span>
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" className="min-w-56">
              <DropdownMenuItem onSelect={onOpenDifferentFolder}>
                <FolderOpenIcon className="size-4" aria-hidden />
                Open different folder…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onRevealRoot}>
                <ShareIcon className="size-4" aria-hidden />
                Reveal in system
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleCopyPath}>
                <CopyIcon className="size-4" aria-hidden />
                Copy folder path
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onCollapseAll}>
                <ChevronsDownUpIcon className="size-4" aria-hidden />
                Collapse all
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onRefresh}>
                <RefreshCwIcon className="size-4" aria-hidden />
                Refresh
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-0.5">
            <ToolbarButton label="New file" onClick={onNewFile}>
              <FilePlusIcon className="size-3.5" aria-hidden />
            </ToolbarButton>
            <ToolbarButton label="New folder" onClick={onNewFolder}>
              <FolderPlusIcon className="size-3.5" aria-hidden />
            </ToolbarButton>
            <ToolbarButton label="Collapse all" onClick={onCollapseAll}>
              <ChevronsDownUpIcon className="size-3.5" aria-hidden />
            </ToolbarButton>
            <ToolbarButton label={refreshing ? 'Refreshing…' : 'Refresh'} onClick={onRefresh}>
              <RefreshCwIcon
                className={cn(
                  'size-3.5',
                  refreshing ? 'motion-safe:animate-spin' : undefined,
                )}
                aria-hidden
              />
            </ToolbarButton>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="More explorer actions"
                      className={cn(
                        'grid size-7 shrink-0 place-items-center rounded-md text-sidebar-foreground/65 transition-colors',
                        'hover:bg-sidebar-accent hover:text-sidebar-foreground',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60',
                      )}
                    >
                      <MoreHorizontalIcon className="size-3.5" aria-hidden />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">More</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuItem onSelect={onRevealRoot}>
                  <ShareIcon className="size-4" aria-hidden />
                  Reveal root in system
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleCopyPath}>
                  <CopyIcon className="size-4" aria-hidden />
                  Copy folder path
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onOpenDifferentFolder}>
                  <FolderOpenIcon className="size-4" aria-hidden />
                  Open different folder…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <ExplorerSearchInput
          value={query}
          onChange={onQueryChange}
          onArrowDown={onSearchArrowDown}
        />
      </div>
    </TooltipProvider>
  );
}
