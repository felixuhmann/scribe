import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ExplorerFolderEntry } from '@/src/scribe-ipc-types';

import {
  ancestorDirsOfFile,
  collectAllDirPaths,
  filterTree,
  flattenVisibleRows,
  normalizePath,
  type PendingCreate,
  type VisibleRow,
} from './tree-types';

const REFETCH_DEBOUNCE_MS = 120;

function expandedStorageKey(rootPath: string): string {
  return `scribe.explorer.expanded.${normalizePath(rootPath)}`;
}

function readPersistedExpanded(rootPath: string): Set<string> {
  try {
    const raw = localStorage.getItem(expandedStorageKey(rootPath));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    /* ignore */
  }
  return new Set();
}

function writePersistedExpanded(rootPath: string, expanded: Set<string>): void {
  try {
    localStorage.setItem(expandedStorageKey(rootPath), JSON.stringify(Array.from(expanded)));
  } catch {
    /* ignore */
  }
}

type UseExplorerTreeArgs = {
  rootPath: string | null;
  activeFilePath: string | null;
};

export type ExplorerTreeState = {
  entries: ExplorerFolderEntry[];
  filteredEntries: ExplorerFolderEntry[];
  visibleRows: VisibleRow[];
  loading: boolean;
  error: string | null;
  query: string;
  setQuery: (q: string) => void;
  expanded: ReadonlySet<string>;
  isExpanded: (dirPath: string) => boolean;
  toggle: (dirPath: string) => void;
  expand: (dirPath: string) => void;
  collapse: (dirPath: string) => void;
  collapseAll: () => void;
  refresh: () => void;
  pending: PendingCreate | null;
  beginCreate: (parentDir: string, createKind: 'file' | 'folder') => void;
  cancelCreate: () => void;
  /** Row index of the currently selected path (-1 if none). */
  selectedIndex: number;
  selectedPath: string | null;
  setSelectedPath: (path: string | null) => void;
  /** Container ref to scroll selected rows into view. */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  rowRefs: React.RefObject<Map<string, HTMLDivElement>>;
};

export function useExplorerTree({ rootPath, activeFilePath }: UseExplorerTreeArgs): ExplorerTreeState {
  const [entries, setEntries] = useState<ExplorerFolderEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<PendingCreate | null>(null);
  const [selectedPath, setSelectedPathState] = useState<string | null>(null);

  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelFetchRef = useRef<{ cancelled: boolean } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastAutoScrolledPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!rootPath) {
      setExpanded(new Set());
      return;
    }
    setExpanded(readPersistedExpanded(rootPath));
  }, [rootPath]);

  useEffect(() => {
    if (!rootPath) return;
    writePersistedExpanded(rootPath, expanded);
  }, [rootPath, expanded]);

  const doFetch = useCallback(async () => {
    if (!rootPath) {
      setEntries([]);
      setError(null);
      setLoading(false);
      return;
    }
    const api = window.scribe?.listExplorerFolder;
    if (!api) {
      setEntries([]);
      setError(null);
      setLoading(false);
      return;
    }
    const token = { cancelled: false };
    cancelFetchRef.current?.cancelled;
    cancelFetchRef.current = token;
    setLoading(true);
    setError(null);
    try {
      const res = await api(rootPath);
      if (token.cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setEntries([]);
      } else {
        setEntries(res.entries);
      }
    } catch (err) {
      if (token.cancelled) return;
      const msg = err instanceof Error ? err.message : 'Could not list folder';
      setError(msg);
      setEntries([]);
    } finally {
      if (!token.cancelled) setLoading(false);
    }
  }, [rootPath]);

  useEffect(() => {
    void doFetch();
    return () => {
      if (cancelFetchRef.current) cancelFetchRef.current.cancelled = true;
    };
  }, [doFetch]);

  useEffect(() => {
    if (!rootPath) return;
    const sub = window.scribe?.subscribeExplorerFolder;
    if (!sub) return;
    const unsub = sub(rootPath, () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      refetchTimerRef.current = setTimeout(() => {
        void doFetch();
      }, REFETCH_DEBOUNCE_MS);
    });
    return () => {
      if (refetchTimerRef.current) {
        clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = null;
      }
      unsub();
    };
  }, [rootPath, doFetch]);

  const toggle = useCallback((dirPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  }, []);

  const expand = useCallback((dirPath: string) => {
    setExpanded((prev) => {
      if (prev.has(dirPath)) return prev;
      const next = new Set(prev);
      next.add(dirPath);
      return next;
    });
  }, []);

  const collapse = useCallback((dirPath: string) => {
    setExpanded((prev) => {
      if (!prev.has(dirPath)) return prev;
      const next = new Set(prev);
      next.delete(dirPath);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  const beginCreate = useCallback(
    (parentDir: string, createKind: 'file' | 'folder') => {
      setExpanded((prev) => {
        if (prev.has(parentDir)) return prev;
        const next = new Set(prev);
        next.add(parentDir);
        return next;
      });
      setPending({ parentDir, kind: createKind });
    },
    [],
  );

  const cancelCreate = useCallback(() => {
    setPending(null);
  }, []);

  const setSelectedPath = useCallback((path: string | null) => {
    setSelectedPathState(path);
  }, []);

  const activeAncestors = useMemo(() => {
    if (!rootPath || !activeFilePath) return new Set<string>();
    const set = new Set<string>(ancestorDirsOfFile(rootPath, activeFilePath));
    set.add(normalizePath(activeFilePath));
    return set;
  }, [rootPath, activeFilePath]);

  useEffect(() => {
    if (!rootPath || !activeFilePath) return;
    const ancestors = ancestorDirsOfFile(rootPath, activeFilePath);
    if (ancestors.length === 0) return;
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const a of ancestors) {
        if (!next.has(a)) {
          next.add(a);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rootPath, activeFilePath]);

  const filteredEntries = useMemo(() => filterTree(entries, query), [entries, query]);

  const visibleRows = useMemo(() => {
    const effectiveExpanded =
      query.trim() === ''
        ? expanded
        : new Set<string>([...expanded, ...collectAllDirPaths(filteredEntries)]);
    return flattenVisibleRows(filteredEntries, effectiveExpanded, activeAncestors, pending);
  }, [filteredEntries, expanded, activeAncestors, pending, query]);

  const selectedIndex = useMemo(() => {
    if (selectedPath === null) return -1;
    return visibleRows.findIndex((r) => r.path === selectedPath);
  }, [selectedPath, visibleRows]);

  useEffect(() => {
    if (!activeFilePath) return;
    if (lastAutoScrolledPathRef.current === activeFilePath) return;
    const el = rowRefs.current.get(activeFilePath);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      lastAutoScrolledPathRef.current = activeFilePath;
    }
  }, [activeFilePath, visibleRows]);

  const isExpanded = useCallback((p: string) => expanded.has(p), [expanded]);

  const refresh = useCallback(() => {
    void doFetch();
  }, [doFetch]);

  return {
    entries,
    filteredEntries,
    visibleRows,
    loading,
    error,
    query,
    setQuery,
    expanded,
    isExpanded,
    toggle,
    expand,
    collapse,
    collapseAll,
    refresh,
    pending,
    beginCreate,
    cancelCreate,
    selectedIndex,
    selectedPath,
    setSelectedPath,
    scrollContainerRef,
    rowRefs,
  };
}
