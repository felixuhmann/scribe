import type { ExplorerFolderEntry } from '@/src/scribe-ipc-types';

/** Pending inline-create row; shown inside a folder once "New file/folder" is triggered. */
export type PendingCreate = {
  parentDir: string;
  kind: 'file' | 'folder';
};

/** A flattened visible row ready for the virtual list / role=tree rendering. */
export type VisibleRow =
  | {
      kind: 'dir';
      path: string;
      name: string;
      depth: number;
      mtimeMs: number;
      expanded: boolean;
      hasChildren: boolean;
      onActivePath: boolean;
    }
  | {
      kind: 'file';
      path: string;
      name: string;
      depth: number;
      mtimeMs: number;
      sizeBytes: number;
      onActivePath: boolean;
    }
  | {
      kind: 'pending-create';
      path: string;
      parentDir: string;
      depth: number;
      createKind: 'file' | 'folder';
    };

export function pathsEqualNormalized(a: string, b: string): boolean {
  return a.replace(/\\/g, '/') === b.replace(/\\/g, '/');
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Ancestor directory chain of a file path within the given root (excluding the file itself). */
export function ancestorDirsOfFile(rootPath: string, filePath: string): string[] {
  const normRoot = normalizePath(rootPath);
  const normFile = normalizePath(filePath);
  if (!normFile.startsWith(normRoot)) return [];
  const rel = normFile.slice(normRoot.length).replace(/^\/+/, '');
  const parts = rel.split('/').filter(Boolean);
  parts.pop();
  const out: string[] = [];
  let acc = normRoot;
  for (const part of parts) {
    acc = acc + '/' + part;
    out.push(acc);
  }
  return out;
}

/** Whether a query matches a filename (substring, case-insensitive, or subsequence fallback). */
export function matchesQuery(name: string, query: string): boolean {
  if (query.trim() === '') return true;
  const hay = name.toLowerCase();
  const needle = query.toLowerCase().trim();
  if (hay.includes(needle)) return true;
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay.charCodeAt(j) === needle.charCodeAt(i)) i++;
  }
  return i === needle.length;
}

/** Walk the tree and return the subset whose files match the query, keeping ancestor dirs. */
export function filterTree(
  entries: ExplorerFolderEntry[],
  query: string,
): ExplorerFolderEntry[] {
  if (query.trim() === '') return entries;
  const out: ExplorerFolderEntry[] = [];
  for (const item of entries) {
    if (item.kind === 'file') {
      if (matchesQuery(item.name, query)) out.push(item);
      continue;
    }
    const children = filterTree(item.children, query);
    if (children.length > 0 || matchesQuery(item.name, query)) {
      out.push({ ...item, children });
    }
  }
  return out;
}

/** Collect every dir path from a tree (used to "expand all during search"). */
export function collectAllDirPaths(entries: ExplorerFolderEntry[]): string[] {
  const out: string[] = [];
  for (const item of entries) {
    if (item.kind === 'dir') {
      out.push(item.path);
      out.push(...collectAllDirPaths(item.children));
    }
  }
  return out;
}

/**
 * Flatten the filtered tree into an ordered list of visible rows, honoring
 * the expanded set and injecting a pending-create ghost row where requested.
 */
export function flattenVisibleRows(
  entries: ExplorerFolderEntry[],
  expanded: ReadonlySet<string>,
  activeAncestors: ReadonlySet<string>,
  pending: PendingCreate | null,
  depth = 0,
): VisibleRow[] {
  const out: VisibleRow[] = [];
  for (const item of entries) {
    if (item.kind === 'dir') {
      const isOpen = expanded.has(item.path);
      const onPath = activeAncestors.has(item.path);
      out.push({
        kind: 'dir',
        path: item.path,
        name: item.name,
        depth,
        mtimeMs: item.mtimeMs,
        expanded: isOpen,
        hasChildren: item.children.length > 0,
        onActivePath: onPath,
      });
      if (isOpen) {
        out.push(...flattenVisibleRows(item.children, expanded, activeAncestors, pending, depth + 1));
        if (pending && pending.parentDir === item.path) {
          out.push({
            kind: 'pending-create',
            path: `${item.path}::__pending__::${pending.kind}`,
            parentDir: item.path,
            depth: depth + 1,
            createKind: pending.kind,
          });
        }
      }
    } else {
      out.push({
        kind: 'file',
        path: item.path,
        name: item.name,
        depth,
        mtimeMs: item.mtimeMs,
        sizeBytes: item.sizeBytes,
        onActivePath: activeAncestors.has(item.path),
      });
    }
  }
  return out;
}
