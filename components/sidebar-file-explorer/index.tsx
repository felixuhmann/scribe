import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  inferContentFormatFromDocumentKey,
  useDocumentWorkspace,
} from '@/components/document-workspace-context';
import { useEditorSession } from '@/components/editor-session-context';
import { editorHtmlToMarkdown } from '@/lib/markdown/markdown-io';

import { DeleteConfirmDialog } from './delete-confirm-dialog';
import {
  DesktopOnlyEmpty,
  LoadErrorEmpty,
  NoFolderOpenedEmpty,
  NoSearchResultsEmpty,
  NoSupportedFilesEmpty,
} from './empty-states';
import { ExplorerHeader } from './explorer-header';
import { ExplorerSkeleton } from './explorer-skeleton';
import { FileTree } from './file-tree';
import { normalizePath, pathsEqualNormalized } from './tree-types';
import { UnsavedChangesDialog } from './unsaved-changes-dialog';
import { useExplorerTree } from './use-explorer-tree';

type DeleteTarget = { path: string; name: string; kind: 'file' | 'dir' };

function basenameOf(p: string): string {
  const n = normalizePath(p).replace(/\/+$/, '');
  const i = n.lastIndexOf('/');
  return i < 0 ? n : n.slice(i + 1);
}

function dirnameOf(p: string): string {
  const n = normalizePath(p).replace(/\/+$/, '');
  const i = n.lastIndexOf('/');
  if (i <= 0) return n;
  return n.slice(0, i);
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    return true;
  } catch {
    return false;
  }
}

export function SidebarFileExplorer() {
  const {
    openedFolderAbsolutePath,
    diskAbsolutePath,
    documentKey,
    isDirty,
    syncDocumentBaseline,
  } = useDocumentWorkspace();
  const { requestOpenDocumentFromDisk, editor } = useEditorSession();

  const hasExplorerApi =
    typeof window !== 'undefined' && Boolean(window.scribe?.listExplorerFolder);

  const tree = useExplorerTree({
    rootPath: openedFolderAbsolutePath ?? null,
    activeFilePath: diskAbsolutePath,
  });

  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
  const [pendingOpenPath, setPendingOpenPath] = useState<string | null>(null);
  const [savingInFlight, setSavingInFlight] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState('');
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback((msg: string) => {
    setLiveMessage(msg);
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    liveTimerRef.current = setTimeout(() => setLiveMessage(''), 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    };
  }, []);

  const openPath = useCallback(
    async (filePath: string) => {
      await requestOpenDocumentFromDisk(filePath);
    },
    [requestOpenDocumentFromDisk],
  );

  const requestOpenMaybeWarn = useCallback(
    (filePath: string) => {
      if (diskAbsolutePath && pathsEqualNormalized(diskAbsolutePath, filePath)) {
        return;
      }
      if (isDirty) {
        setPendingOpenPath(filePath);
        setUnsavedDialogOpen(true);
        return;
      }
      void openPath(filePath);
    },
    [diskAbsolutePath, isDirty, openPath],
  );

  const onUnsavedCancel = useCallback(() => {
    setUnsavedDialogOpen(false);
    setPendingOpenPath(null);
  }, []);

  const onDiscardAndOpen = useCallback(() => {
    const target = pendingOpenPath;
    setUnsavedDialogOpen(false);
    setPendingOpenPath(null);
    if (target) void openPath(target);
  }, [pendingOpenPath, openPath]);

  const saveCurrentToDisk = useCallback(async (): Promise<boolean> => {
    if (!editor || !diskAbsolutePath) return false;
    const fmt = inferContentFormatFromDocumentKey(documentKey);
    const html = editor.getHTML();
    const toHtmlPath = window.scribe?.saveHtmlToPath;
    const toMdPath = window.scribe?.saveMarkdownToPath;
    try {
      if (fmt === 'markdown') {
        if (!toMdPath) throw new Error('Markdown save unavailable');
        const md = editorHtmlToMarkdown(html);
        const res = await toMdPath(diskAbsolutePath, md);
        if (!res.ok) throw new Error(res.error ?? 'Save failed');
      } else {
        if (!toHtmlPath) throw new Error('HTML save unavailable');
        const res = await toHtmlPath(diskAbsolutePath, html);
        if (!res.ok) throw new Error(res.error ?? 'Save failed');
      }
      syncDocumentBaseline(html);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast.error(msg);
      return false;
    }
  }, [editor, diskAbsolutePath, documentKey, syncDocumentBaseline]);

  const onSaveAndOpen = useCallback(async () => {
    const target = pendingOpenPath;
    if (!target) return;
    setSavingInFlight(true);
    const ok = await saveCurrentToDisk();
    setSavingInFlight(false);
    if (!ok) return;
    setUnsavedDialogOpen(false);
    setPendingOpenPath(null);
    void openPath(target);
  }, [pendingOpenPath, saveCurrentToDisk, openPath]);

  const canSave = Boolean(editor && diskAbsolutePath);

  const onRevealPath = useCallback(
    async (p: string) => {
      const api = window.scribe?.revealInOS;
      if (!api) return;
      const res = await api(p);
      if (!res.ok) toast.error(res.error);
    },
    [],
  );

  const onCopyAbsolutePath = useCallback(
    async (p: string) => {
      const ok = await copyTextToClipboard(p);
      if (ok) {
        announce(`Copied path ${basenameOf(p)}`);
        toast.success('Copied path to clipboard');
      } else {
        toast.error('Could not copy path');
      }
    },
    [announce],
  );

  const onCopyRelativePath = useCallback(
    async (rel: string) => {
      const ok = await copyTextToClipboard(rel);
      if (ok) {
        announce('Copied relative path');
        toast.success('Copied relative path');
      } else {
        toast.error('Could not copy path');
      }
    },
    [announce],
  );

  const onRenameBegin = useCallback((path: string) => {
    setRenamingPath(path);
  }, []);

  const onRenameCancel = useCallback(() => {
    setRenamingPath(null);
  }, []);

  const onRenameCommit = useCallback(
    async (path: string, newName: string) => {
      const api = window.scribe?.renameFile;
      setRenamingPath(null);
      if (!api) return;
      const res = await api(path, newName);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      announce(`Renamed to ${basenameOf(res.path)}`);
      if (diskAbsolutePath && pathsEqualNormalized(diskAbsolutePath, path)) {
        void requestOpenDocumentFromDisk(res.path);
      }
      tree.refresh();
    },
    [announce, diskAbsolutePath, requestOpenDocumentFromDisk, tree],
  );

  const onDeletePath = useCallback((path: string, kind: 'file' | 'dir') => {
    setDeleteTarget({ path, name: basenameOf(path), kind });
    setDeleteOpen(true);
  }, []);

  const onDeleteConfirm = useCallback(async () => {
    const target = deleteTarget;
    setDeleteOpen(false);
    setDeleteTarget(null);
    if (!target) return;
    const api = window.scribe?.trashItem;
    if (!api) return;
    const res = await api(target.path);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    announce(`Moved ${target.name} to Trash`);
    toast.success(`Moved ${target.name} to Trash`);
    tree.refresh();
  }, [deleteTarget, announce, tree]);

  const onCreateCommit = useCallback(
    async (parentDir: string, createKind: 'file' | 'folder', name: string) => {
      if (createKind === 'file') {
        const api = window.scribe?.createFileInFolder;
        if (!api) return;
        const res = await api(parentDir, name);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        announce(`Created ${basenameOf(res.path)}`);
        tree.refresh();
        if (isDirty) {
          setPendingOpenPath(res.path);
          setUnsavedDialogOpen(true);
        } else {
          void openPath(res.path);
        }
      } else {
        const api = window.scribe?.createFolderInFolder;
        if (!api) return;
        const res = await api(parentDir, name);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        announce(`Created folder ${basenameOf(res.path)}`);
        tree.expand(res.path);
        tree.refresh();
      }
    },
    [announce, isDirty, openPath, tree],
  );

  const onHeaderNewFile = useCallback(() => {
    if (!openedFolderAbsolutePath) return;
    const parent =
      tree.selectedPath !== null
        ? resolveParentForNewEntry(tree, openedFolderAbsolutePath)
        : openedFolderAbsolutePath;
    tree.beginCreate(parent, 'file');
  }, [openedFolderAbsolutePath, tree]);

  const onHeaderNewFolder = useCallback(() => {
    if (!openedFolderAbsolutePath) return;
    const parent =
      tree.selectedPath !== null
        ? resolveParentForNewEntry(tree, openedFolderAbsolutePath)
        : openedFolderAbsolutePath;
    tree.beginCreate(parent, 'folder');
  }, [openedFolderAbsolutePath, tree]);

  const onRevealRoot = useCallback(() => {
    if (!openedFolderAbsolutePath) return;
    void onRevealPath(openedFolderAbsolutePath);
  }, [openedFolderAbsolutePath, onRevealPath]);

  const onCopyRootPath = useCallback(() => {
    if (!openedFolderAbsolutePath) return;
    void onCopyAbsolutePath(openedFolderAbsolutePath);
  }, [openedFolderAbsolutePath, onCopyAbsolutePath]);

  const onOpenDifferentFolder = useCallback(async () => {
    const api = window.scribe?.openDocument;
    if (!api) return;
    const result = await api();
    if (!result.ok) return;
    void requestOpenDocumentFromDisk(result.path);
  }, [requestOpenDocumentFromDisk]);

  const searchInputFocusTrigger = useRef<(() => void) | null>(null);

  if (!openedFolderAbsolutePath) {
    return <NoFolderOpenedEmpty onOpenFolder={onOpenDifferentFolder} />;
  }
  if (!hasExplorerApi) {
    return <DesktopOnlyEmpty />;
  }

  const showSkeleton = tree.loading && tree.entries.length === 0;
  const showError = !tree.loading && tree.error !== null;
  const showEmptyFolder =
    !tree.loading && !tree.error && tree.entries.length === 0 && tree.query.trim() === '';
  const showNoResults =
    !tree.loading &&
    !tree.error &&
    tree.query.trim() !== '' &&
    tree.filteredEntries.length === 0;

  const pendingName = pendingOpenPath ? basenameOf(pendingOpenPath) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ExplorerHeader
        rootPath={openedFolderAbsolutePath}
        query={tree.query}
        onQueryChange={tree.setQuery}
        onSearchArrowDown={() => {
          const first = tree.visibleRows[0];
          if (first && first.kind !== 'pending-create') {
            tree.setSelectedPath(first.path);
            const el = tree.rowRefs.current.get(first.path);
            el?.focus({ preventScroll: false });
          }
        }}
        onRefresh={() => {
          tree.refresh();
          announce('Refreshed folder');
        }}
        onCollapseAll={tree.collapseAll}
        onNewFile={onHeaderNewFile}
        onNewFolder={onHeaderNewFolder}
        onRevealRoot={onRevealRoot}
        onCopyRootPath={onCopyRootPath}
        onOpenDifferentFolder={onOpenDifferentFolder}
        refreshing={tree.loading && tree.entries.length > 0}
      />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {showSkeleton ? <ExplorerSkeleton /> : null}
        {showError ? (
          <LoadErrorEmpty message={tree.error ?? 'Unknown error'} onRetry={tree.refresh} />
        ) : null}
        {showEmptyFolder ? (
          <NoSupportedFilesEmpty onNewFile={onHeaderNewFile} onRefresh={tree.refresh} />
        ) : null}
        {showNoResults ? (
          <NoSearchResultsEmpty query={tree.query} onClear={() => tree.setQuery('')} />
        ) : null}
        {!showSkeleton && !showError && !showEmptyFolder && !showNoResults ? (
          <FileTree
            tree={tree}
            rootPath={openedFolderAbsolutePath}
            activeFilePath={diskAbsolutePath}
            isDirty={isDirty}
            renamingPath={renamingPath}
            onRenameBegin={onRenameBegin}
            onRenameCommit={onRenameCommit}
            onRenameCancel={onRenameCancel}
            onCreateCommit={onCreateCommit}
            onOpenFile={(path) => requestOpenMaybeWarn(path)}
            onRevealPath={onRevealPath}
            onDeletePath={onDeletePath}
            onCopyPath={onCopyAbsolutePath}
            onCopyRelativePath={onCopyRelativePath}
            onRequestFocusSearch={() => searchInputFocusTrigger.current?.()}
          />
        ) : null}
      </div>

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {liveMessage}
      </div>

      <UnsavedChangesDialog
        open={unsavedDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setUnsavedDialogOpen(false);
            setPendingOpenPath(null);
          }
        }}
        pendingFileName={pendingName}
        onCancel={onUnsavedCancel}
        onDiscardAndOpen={onDiscardAndOpen}
        onSaveAndOpen={onSaveAndOpen}
        saveInFlight={savingInFlight}
        canSave={canSave}
      />
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteOpen(false);
            setDeleteTarget(null);
          }
        }}
        target={deleteTarget}
        onConfirm={onDeleteConfirm}
      />
    </div>
  );
}

/**
 * When the user triggers "New file" / "New folder" from the header, use the
 * closest expanded directory of the selected row (or root if none).
 */
function resolveParentForNewEntry(
  tree: ReturnType<typeof useExplorerTree>,
  rootPath: string,
): string {
  const sel = tree.selectedPath;
  if (!sel) return rootPath;
  const row = tree.visibleRows.find((r) => r.path === sel);
  if (!row || row.kind === 'pending-create') return rootPath;
  if (row.kind === 'dir') return row.path;
  return dirnameOf(row.path);
}
