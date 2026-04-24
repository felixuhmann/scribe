import { useCallback, useEffect, useMemo, useRef } from 'react';

import { cn } from '@/lib/utils';

import { RowContextMenu } from './row-context-menu';
import { PendingCreateRow, TreeRow, fileKindFromName } from './tree-row';
import type { ExplorerTreeState } from './use-explorer-tree';
import { normalizePath } from './tree-types';

type FileTreeProps = {
  tree: ExplorerTreeState;
  rootPath: string;
  activeFilePath: string | null;
  isDirty: boolean;
  renamingPath: string | null;
  onRenameBegin: (path: string) => void;
  onRenameCommit: (path: string, newName: string) => void;
  onRenameCancel: () => void;
  onCreateCommit: (parentDir: string, createKind: 'file' | 'folder', name: string) => void;
  onOpenFile: (path: string) => void;
  onRevealPath: (path: string) => void;
  onDeletePath: (path: string, kind: 'file' | 'dir') => void;
  onCopyPath: (path: string) => void;
  onCopyRelativePath: (path: string) => void;
  onDuplicatePath?: (path: string) => void;
  onRequestFocusSearch?: () => void;
};

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  if (t.isContentEditable) return true;
  return false;
}

function dirnameNormalized(p: string): string {
  const n = normalizePath(p);
  const i = n.lastIndexOf('/');
  if (i <= 0) return n;
  return n.slice(0, i);
}

function relativePathFromRoot(rootPath: string, p: string): string {
  const r = normalizePath(rootPath).replace(/\/+$/, '');
  const n = normalizePath(p);
  if (n === r) return '';
  if (n.startsWith(r + '/')) return n.slice(r.length + 1);
  return n;
}

export function FileTree({
  tree,
  rootPath,
  activeFilePath,
  isDirty,
  renamingPath,
  onRenameBegin,
  onRenameCommit,
  onRenameCancel,
  onCreateCommit,
  onOpenFile,
  onRevealPath,
  onDeletePath,
  onCopyPath,
  onCopyRelativePath,
  onDuplicatePath,
  onRequestFocusSearch,
}: FileTreeProps) {
  const {
    visibleRows,
    selectedPath,
    setSelectedPath,
    toggle,
    expand,
    collapse,
    pending,
    beginCreate,
    cancelCreate,
    scrollContainerRef,
    rowRefs,
    query,
  } = tree;

  const treeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (selectedPath === null) return;
    const idx = visibleRows.findIndex((r) => r.path === selectedPath);
    if (idx === -1) return;
    const el = rowRefs.current.get(selectedPath);
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedPath, visibleRows, rowRefs]);

  const focusRow = useCallback(
    (path: string) => {
      setSelectedPath(path);
      const el = rowRefs.current.get(path);
      if (el) {
        el.focus({ preventScroll: true });
      } else {
        treeRef.current?.focus({ preventScroll: true });
      }
    },
    [rowRefs, setSelectedPath],
  );

  const activePathNormalized = activeFilePath ? normalizePath(activeFilePath) : null;

  const selectedSiblings = useMemo(() => {
    if (selectedPath === null) return { index: -1 };
    return { index: visibleRows.findIndex((r) => r.path === selectedPath) };
  }, [selectedPath, visibleRows]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isEditableTarget(e.target)) return;
      if (visibleRows.length === 0) return;
      const idx = selectedSiblings.index;

      const selectByIndex = (nextIdx: number) => {
        if (nextIdx < 0 || nextIdx >= visibleRows.length) return;
        const row = visibleRows[nextIdx];
        if (row.kind === 'pending-create') return;
        focusRow(row.path);
      };

      const key = e.key;
      if (key === 'ArrowDown') {
        e.preventDefault();
        for (let i = Math.max(idx, -1) + 1; i < visibleRows.length; i++) {
          if (visibleRows[i].kind !== 'pending-create') {
            selectByIndex(i);
            return;
          }
        }
        return;
      }
      if (key === 'ArrowUp') {
        e.preventDefault();
        if (idx <= 0) {
          onRequestFocusSearch?.();
          return;
        }
        for (let i = idx - 1; i >= 0; i--) {
          if (visibleRows[i].kind !== 'pending-create') {
            selectByIndex(i);
            return;
          }
        }
        return;
      }
      if (key === 'Home') {
        e.preventDefault();
        selectByIndex(0);
        return;
      }
      if (key === 'End') {
        e.preventDefault();
        for (let i = visibleRows.length - 1; i >= 0; i--) {
          if (visibleRows[i].kind !== 'pending-create') {
            selectByIndex(i);
            return;
          }
        }
        return;
      }
      if (idx < 0) return;
      const current = visibleRows[idx];
      if (current.kind === 'pending-create') return;

      if (key === 'ArrowRight') {
        e.preventDefault();
        if (current.kind === 'dir') {
          if (!current.expanded) {
            expand(current.path);
          } else {
            for (let i = idx + 1; i < visibleRows.length; i++) {
              if (visibleRows[i].kind !== 'pending-create') {
                selectByIndex(i);
                return;
              }
            }
          }
        }
        return;
      }
      if (key === 'ArrowLeft') {
        e.preventDefault();
        if (current.kind === 'dir' && current.expanded) {
          collapse(current.path);
        } else {
          const parentDepth = current.depth - 1;
          if (parentDepth < 0) return;
          for (let i = idx - 1; i >= 0; i--) {
            const prev = visibleRows[i];
            if (prev.kind !== 'pending-create' && prev.depth === parentDepth) {
              selectByIndex(i);
              return;
            }
          }
        }
        return;
      }
      if (key === 'Enter') {
        e.preventDefault();
        if (current.kind === 'dir') {
          toggle(current.path);
        } else if (current.kind === 'file') {
          onOpenFile(current.path);
        }
        return;
      }
      if (key === ' ') {
        e.preventDefault();
        if (current.kind === 'dir') {
          toggle(current.path);
        } else {
          onOpenFile(current.path);
        }
        return;
      }
      if (key === 'F2') {
        e.preventDefault();
        onRenameBegin(current.path);
        return;
      }
      if (key === 'Delete' || key === 'Backspace') {
        if (key === 'Backspace' && !e.metaKey) return;
        e.preventDefault();
        onDeletePath(current.path, current.kind);
        return;
      }
      if (key.length === 1 && /[\p{L}\p{N}._-]/u.test(key)) {
        const lower = key.toLowerCase();
        const depth = current.depth;
        for (let i = idx + 1; i < visibleRows.length; i++) {
          const r = visibleRows[i];
          if (r.kind === 'pending-create') continue;
          if (r.depth === depth && r.name.toLowerCase().startsWith(lower)) {
            selectByIndex(i);
            return;
          }
        }
        for (let i = 0; i < idx; i++) {
          const r = visibleRows[i];
          if (r.kind === 'pending-create') continue;
          if (r.depth === depth && r.name.toLowerCase().startsWith(lower)) {
            selectByIndex(i);
            return;
          }
        }
      }
    },
    [
      visibleRows,
      selectedSiblings.index,
      focusRow,
      expand,
      collapse,
      toggle,
      onOpenFile,
      onRenameBegin,
      onDeletePath,
      onRequestFocusSearch,
    ],
  );

  const handleRegisterRowRef = useCallback(
    (path: string) => (el: HTMLDivElement | null) => {
      if (el) rowRefs.current.set(path, el);
      else rowRefs.current.delete(path);
    },
    [rowRefs],
  );

  const hasVisible = visibleRows.length > 0;

  return (
    <div
      ref={scrollContainerRef}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <div
        ref={treeRef}
        role="tree"
        aria-label="File explorer"
        tabIndex={hasVisible ? 0 : -1}
        onKeyDown={onKeyDown}
        className={cn(
          'flex flex-col py-1 pl-0 pr-1 outline-none',
          'focus-visible:outline-none',
        )}
      >
        {visibleRows.map((row, i) => {
          if (row.kind === 'pending-create') {
            return (
              <PendingCreateRow
                key={row.path}
                depth={row.depth}
                createKind={row.createKind}
                onSubmit={(name) => {
                  onCreateCommit(row.parentDir, row.createKind, name);
                  cancelCreate();
                }}
                onCancel={() => {
                  cancelCreate();
                }}
              />
            );
          }
          const isActive =
            row.kind === 'file' &&
            activePathNormalized !== null &&
            normalizePath(row.path) === activePathNormalized;
          const isSelected = selectedPath === row.path;
          const common = {
            depth: row.depth,
            selected: isSelected,
            active: isActive,
            dirty: isActive && isDirty,
            onActivePath: row.onActivePath,
            query,
            renaming: renamingPath === row.path,
            onRenameSubmit: (v: string) => onRenameCommit(row.path, v),
            onRenameCancel: onRenameCancel,
            onClick: () => {
              setSelectedPath(row.path);
              if (row.kind === 'dir') {
                toggle(row.path);
              } else if (row.kind === 'file') {
                onOpenFile(row.path);
              }
            },
            onDoubleClick: () => {
              if (row.kind === 'file') onOpenFile(row.path);
            },
            onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => {
              if (e.button === 2) {
                setSelectedPath(row.path);
              } else if (e.button === 0) {
                setSelectedPath(row.path);
              }
            },
            rowRef: handleRegisterRowRef(row.path),
            ariaSetSize: visibleRows.length,
            ariaPosInSet: i + 1,
          } as const;

          const ctxTarget =
            row.kind === 'dir'
              ? row.path
              : row.path;
          const ctxParentDir = row.kind === 'dir' ? row.path : dirnameNormalized(row.path);

          const ctxMenuProps = {
            kind: row.kind,
            onOpen: row.kind === 'file' ? () => onOpenFile(row.path) : undefined,
            onReveal: () => onRevealPath(ctxTarget),
            onRename: () => onRenameBegin(row.path),
            onDuplicate: onDuplicatePath ? () => onDuplicatePath(row.path) : undefined,
            onDelete: () => onDeletePath(row.path, row.kind),
            onNewFile: () => beginCreate(ctxParentDir, 'file'),
            onNewFolder: () => beginCreate(ctxParentDir, 'folder'),
            onCopyPath: () => onCopyPath(row.path),
            onCopyRelativePath: () => onCopyRelativePath(relativePathFromRoot(rootPath, row.path)),
          } as const;

          if (row.kind === 'dir') {
            return (
              <RowContextMenu key={row.path} {...ctxMenuProps}>
                <TreeRow
                  kind="dir"
                  name={row.name}
                  expanded={row.expanded}
                  hasChildren={row.hasChildren}
                  onToggle={() => toggle(row.path)}
                  {...common}
                />
              </RowContextMenu>
            );
          }
          return (
            <RowContextMenu key={row.path} {...ctxMenuProps}>
              <TreeRow
                kind="file"
                name={row.name}
                fileType={fileKindFromName(row.name)}
                {...common}
              />
            </RowContextMenu>
          );
        })}
      </div>
      {pending && !visibleRows.some((r) => r.kind === 'pending-create') ? (
        <div className="px-1 py-1">
          <PendingCreateRow
            depth={0}
            createKind={pending.kind}
            onSubmit={(name) => {
              onCreateCommit(pending.parentDir, pending.kind, name);
              cancelCreate();
            }}
            onCancel={() => cancelCreate()}
          />
        </div>
      ) : null}
    </div>
  );
}
