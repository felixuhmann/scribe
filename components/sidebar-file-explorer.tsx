import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRightIcon, FileIcon, FolderIcon } from 'lucide-react';

import { useDocumentWorkspace } from '@/components/document-workspace-context';
import { useEditorSession } from '@/components/editor-session-context';
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import type { ExplorerFolderEntry } from '@/src/scribe-ipc-types';

function pathsEqualNormalized(a: string, b: string): boolean {
  return a.replace(/\\/g, '/') === b.replace(/\\/g, '/');
}

function ExplorerSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 px-1 py-1">
      <Skeleton className="h-7 w-full" />
      <Skeleton className="h-7 w-full" />
      <Skeleton className="h-7 w-4/5" />
    </div>
  );
}

export function SidebarFileExplorer() {
  const { openedFolderAbsolutePath, diskAbsolutePath, isDirty } = useDocumentWorkspace();
  const { requestOpenDocumentFromDisk } = useEditorSession();

  const [entries, setEntries] = useState<ExplorerFolderEntry[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
  const pendingOpenPathRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const root = openedFolderAbsolutePath;
    if (!root) {
      setEntries([]);
      setListError(null);
      setListLoading(false);
      return;
    }
    const api = window.scribe?.listExplorerFolder;
    if (!api) {
      setEntries([]);
      setListError(null);
      setListLoading(false);
      return;
    }
    setListLoading(true);
    setListError(null);
    setEntries([]);
    void api(root).then((res) => {
      if (cancelled) return;
      setListLoading(false);
      if (!res.ok) {
        setListError(res.error);
        setEntries([]);
        return;
      }
      setEntries(res.entries);
    });
    return () => {
      cancelled = true;
    };
  }, [openedFolderAbsolutePath]);

  const requestOpenMaybeWarn = useCallback(
    (filePath: string) => {
      if (diskAbsolutePath && pathsEqualNormalized(diskAbsolutePath, filePath)) {
        return;
      }
      if (isDirty) {
        pendingOpenPathRef.current = filePath;
        setUnsavedDialogOpen(true);
        return;
      }
      void requestOpenDocumentFromDisk(filePath);
    },
    [diskAbsolutePath, isDirty, requestOpenDocumentFromDisk],
  );

  const onUnsavedDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      pendingOpenPathRef.current = null;
    }
    setUnsavedDialogOpen(open);
  }, []);

  const confirmDiscardAndOpen = useCallback(() => {
    const target = pendingOpenPathRef.current;
    pendingOpenPathRef.current = null;
    setUnsavedDialogOpen(false);
    if (target) {
      void requestOpenDocumentFromDisk(target);
    }
  }, [requestOpenDocumentFromDisk]);

  const renderEntry = useCallback(
    (item: ExplorerFolderEntry): ReactNode => {
      if (item.kind === 'dir') {
        return (
          <Collapsible key={item.path}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="group h-auto min-h-7 w-full justify-start gap-1.5 py-1 font-normal transition-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <ChevronRightIcon
                  data-icon="inline-start"
                  className="transition-transform group-data-[state=open]:rotate-90"
                />
                <FolderIcon data-icon="inline-start" />
                <span className="truncate">{item.name}</span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 flex flex-col gap-1 pl-3">
              {item.children.map((child) => renderEntry(child))}
            </CollapsibleContent>
          </Collapsible>
        );
      }
      const selected =
        diskAbsolutePath !== null && pathsEqualNormalized(diskAbsolutePath, item.path);
      return (
        <Button
          key={item.path}
          type="button"
          variant="ghost"
          size="sm"
          title={item.path}
          onClick={() => requestOpenMaybeWarn(item.path)}
          className={
            selected
              ? 'h-auto min-h-7 w-full justify-start gap-1.5 bg-sidebar-accent py-1 font-normal text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              : 'h-auto min-h-7 w-full justify-start gap-1.5 py-1 font-normal hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          }
        >
          <FileIcon data-icon="inline-start" />
          <span className="truncate">{item.name}</span>
        </Button>
      );
    },
    [diskAbsolutePath, requestOpenMaybeWarn],
  );

  const hasExplorerApi = typeof window !== 'undefined' && Boolean(window.scribe?.listExplorerFolder);

  if (!openedFolderAbsolutePath) {
    return (
      <div className="text-sidebar-foreground/70 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-2 text-xs leading-snug">
        <p>Open a document from disk (menu: File → Open) to browse the folder it lives in.</p>
      </div>
    );
  }

  if (!hasExplorerApi) {
    return (
      <div className="text-sidebar-foreground/70 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-2 text-xs leading-snug">
        <p>File browsing is available in the desktop app.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="text-sidebar-foreground/60 border-sidebar-border/60 truncate border-b px-2 py-1.5 font-mono text-[10px] leading-tight">
          {openedFolderAbsolutePath}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
          {listLoading ? <ExplorerSkeleton /> : null}
          {!listLoading && listError ? (
            <p className="text-destructive px-1 text-xs">{listError}</p>
          ) : null}
          {!listLoading && !listError && entries.length === 0 ? (
            <p className="text-sidebar-foreground/70 px-1 text-xs leading-snug">
              No supported files here (HTML, Markdown, or .txt). Hidden folders, node_modules, and .git are skipped.
            </p>
          ) : null}
          {!listLoading && !listError && entries.length > 0 ? (
            <div className="flex flex-col gap-1">{entries.map((item) => renderEntry(item))}</div>
          ) : null}
        </div>
      </div>

      <AlertDialog open={unsavedDialogOpen} onOpenChange={onUnsavedDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved edits in the current document. Opening another file will discard those
              changes unless you save first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction type="button" variant="destructive" onClick={confirmDiscardAndOpen}>
              Discard and open
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
