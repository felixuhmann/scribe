import {
  CopyIcon,
  FilePlusIcon,
  FileSymlinkIcon,
  FolderPlusIcon,
  PencilIcon,
  ShareIcon,
  Trash2Icon,
} from 'lucide-react';
import type { ReactNode } from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

type RowContextMenuProps = {
  children: ReactNode;
  kind: 'dir' | 'file';
  onOpen?: () => void;
  onReveal: () => void;
  onRename: () => void;
  onDuplicate?: () => void;
  onDelete: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onCopyPath: () => void;
  onCopyRelativePath: () => void;
};

export function RowContextMenu({
  children,
  kind,
  onOpen,
  onReveal,
  onRename,
  onDuplicate,
  onDelete,
  onNewFile,
  onNewFolder,
  onCopyPath,
  onCopyRelativePath,
}: RowContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-56">
        {kind === 'file' && onOpen ? (
          <ContextMenuItem onSelect={onOpen}>
            <FileSymlinkIcon aria-hidden />
            Open
            <ContextMenuShortcut>Enter</ContextMenuShortcut>
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem onSelect={onReveal}>
          <ShareIcon aria-hidden />
          Reveal in system
        </ContextMenuItem>
        <ContextMenuItem onSelect={onRename}>
          <PencilIcon aria-hidden />
          Rename
          <ContextMenuShortcut>F2</ContextMenuShortcut>
        </ContextMenuItem>
        {onDuplicate ? (
          <ContextMenuItem onSelect={onDuplicate}>
            <CopyIcon aria-hidden />
            Duplicate
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2Icon aria-hidden />
          Move to Trash
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onNewFile}>
          <FilePlusIcon aria-hidden />
          New file…
        </ContextMenuItem>
        <ContextMenuItem onSelect={onNewFolder}>
          <FolderPlusIcon aria-hidden />
          New folder…
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onCopyPath}>
          <CopyIcon aria-hidden />
          Copy path
        </ContextMenuItem>
        <ContextMenuItem onSelect={onCopyRelativePath}>
          <CopyIcon aria-hidden />
          Copy relative path
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
