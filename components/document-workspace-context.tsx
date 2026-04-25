import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { recordRecentDiskPath } from '@/components/document-workspace/recent-disk-files';

const STORAGE_KEY = 'scribe.documentKey';
const FOLDER_STORAGE_KEY = 'scribe.openedFolderPath';

/** No document open yet — show the start gate until the user opens a file. */
export const IDLE_DOCUMENT_KEY = 'idle';

/** Parent directory of an absolute file path (Windows and POSIX). */
export function dirnameAbsolutePath(absolutePath: string): string {
  const normalized = absolutePath.trim().replace(/[/\\]+$/, '');
  const i = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (i <= 0) return normalized;
  return normalized.slice(0, i) || normalized;
}

/** Slash-normalized absolute path with no trailing separators (cross-platform compare). */
function normalizeForCompare(absolutePath: string): string {
  return absolutePath.trim().replace(/\\/g, '/').replace(/\/+$/, '');
}

/** True iff `filePath` lives somewhere inside `rootPath` (or is the root itself). */
export function isPathWithin(filePath: string, rootPath: string): boolean {
  const f = normalizeForCompare(filePath);
  const r = normalizeForCompare(rootPath);
  if (r === '') return false;
  if (f === r) return true;
  return f.startsWith(r + '/');
}

function readStoredOpenedFolderPath(): string | null {
  try {
    const v = sessionStorage.getItem(FOLDER_STORAGE_KEY);
    if (v && v.trim() !== '') return v;
  } catch {
    /* ignore */
  }
  return null;
}

/** Stable workspace id for a file on disk (used for chat persistence). */
export function documentKeyFromAbsolutePath(absolutePath: string): string {
  const trimmed = absolutePath.trim();
  return `file:${encodeURIComponent(trimmed)}`;
}

export function absolutePathFromDocumentKey(documentKey: string): string | null {
  if (!documentKey.startsWith('file:')) return null;
  try {
    return decodeURIComponent(documentKey.slice('file:'.length));
  } catch {
    return null;
  }
}

function inferFormatFromFilename(nameOrPath: string): 'html' | 'markdown' {
  const lower = nameOrPath.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return 'markdown';
  }
  return 'html';
}

/**
 * How the current document should be written when saving to disk (when no “Save as” format is chosen).
 * Derived from the backing filename for `file:` and `local:` keys.
 */
export function inferContentFormatFromDocumentKey(documentKey: string): 'html' | 'markdown' | null {
  if (documentKey === IDLE_DOCUMENT_KEY) return null;
  const filePath = absolutePathFromDocumentKey(documentKey);
  if (filePath) {
    return inferFormatFromFilename(filePath);
  }
  if (documentKey.startsWith('local:')) {
    const name = documentKey.slice('local:'.length).split(':')[0];
    return inferFormatFromFilename(name);
  }
  return null;
}

function readStoredDocumentKey(): string {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v && v.trim() !== '') {
      if (v === 'scratch') return IDLE_DOCUMENT_KEY;
      return v;
    }
  } catch {
    /* ignore */
  }
  return IDLE_DOCUMENT_KEY;
}

export function formatDocumentLabel(documentKey: string): string {
  const key = documentKey.trim() || IDLE_DOCUMENT_KEY;
  if (key === IDLE_DOCUMENT_KEY) return '';
  if (key === 'scratch') return 'Scratch';
  if (key.startsWith('unsaved:')) return 'Untitled';
  if (key.startsWith('file:')) {
    const p = absolutePathFromDocumentKey(key);
    if (!p) return 'Saved file';
    const base = p.split(/[/\\]/).pop();
    return base && base.trim() !== '' ? base : 'Saved file';
  }
  if (key.startsWith('local:')) {
    const rest = key.slice('local:'.length);
    const name = rest.split(':')[0];
    return name && name.trim() !== '' ? name : 'Local file';
  }
  return 'Document';
}

type BootstrapPayload = { documentKey: string; html: string };

type DocumentWorkspaceValue = {
  documentKey: string;
  documentLabel: string;
  /** Absolute path when this document is backed by a real file (Save without dialog). */
  diskAbsolutePath: string | null;
  /**
   * Folder shown in the Files sidebar: parent of the last opened/saved-on-disk document,
   * or a path persisted in session storage. Stays set when switching to an unsaved tab.
   */
  openedFolderAbsolutePath: string | null;
  isDirty: boolean;
  /** Call after loading/replacing editor content so “dirty” compares to this snapshot. */
  syncDocumentBaseline: (html: string) => void;
  /** Editor content changed; updates dirty vs baseline (no-op until baseline is set). */
  noteEditorHtmlChanged: (html: string) => void;
  notifyOpenedLocalFile: (file: File, initialEditorHtml?: string | null) => void;
  /** Prefer this in Electron: stable path-based key and disk saves. */
  notifyOpenedFromDisk: (absolutePath: string, initialEditorHtml?: string | null) => void;
  /** HTML to inject on first editor mount (used when opening before the editor exists). */
  getBootstrapEditorHtml: (forDocumentKey: string) => string | null;
  notifyNewBlankDocument: () => void;
  /** After Save As, point the workspace at the new path without reloading editor HTML. */
  adoptSavedFilePath: (absolutePath: string) => void;
};

const DocumentWorkspaceContext = createContext<DocumentWorkspaceValue | null>(null);

export function DocumentWorkspaceProvider({ children }: { children: ReactNode }) {
  const [documentKey, setDocumentKey] = useState(readStoredDocumentKey);
  const [openedFolderAbsolutePath, setOpenedFolderAbsolutePath] = useState<string | null>(
    readStoredOpenedFolderPath,
  );
  const savedHtmlRef = useRef<string | null>(null);
  const bootstrapEditorRef = useRef<BootstrapPayload | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, documentKey);
    } catch {
      /* ignore */
    }
  }, [documentKey]);

  const diskAbsolutePath = useMemo(() => absolutePathFromDocumentKey(documentKey), [documentKey]);

  useEffect(() => {
    if (!diskAbsolutePath) return;
    recordRecentDiskPath(diskAbsolutePath);
  }, [diskAbsolutePath]);

  useEffect(() => {
    if (!diskAbsolutePath) return;
    const dir = dirnameAbsolutePath(diskAbsolutePath);
    if (!dir || dir === diskAbsolutePath) return;
    setOpenedFolderAbsolutePath((prev) => {
      // Keep the broader workspace folder when the newly-opened file is already
      // inside it — only narrow the root when the file is outside the current root.
      if (prev && isPathWithin(diskAbsolutePath, prev)) {
        return prev;
      }
      try {
        sessionStorage.setItem(FOLDER_STORAGE_KEY, dir);
      } catch {
        /* ignore */
      }
      return dir;
    });
  }, [diskAbsolutePath]);

  const syncDocumentBaseline = useCallback((html: string) => {
    savedHtmlRef.current = html;
    setIsDirty(false);
  }, []);

  const noteEditorHtmlChanged = useCallback((html: string) => {
    if (savedHtmlRef.current === null) return;
    setIsDirty(html !== savedHtmlRef.current);
  }, []);

  const notifyOpenedLocalFile = useCallback((file: File, initialEditorHtml?: string | null) => {
    const key = `local:${file.name}:${file.lastModified}:${file.size}`;
    if (initialEditorHtml != null && initialEditorHtml !== '') {
      bootstrapEditorRef.current = { documentKey: key, html: initialEditorHtml };
    } else {
      bootstrapEditorRef.current = null;
    }
    setDocumentKey(key);
  }, []);

  const notifyOpenedFromDisk = useCallback((absolutePath: string, initialEditorHtml?: string | null) => {
    const key = documentKeyFromAbsolutePath(absolutePath.trim());
    if (initialEditorHtml != null && initialEditorHtml !== '') {
      bootstrapEditorRef.current = { documentKey: key, html: initialEditorHtml };
    } else {
      bootstrapEditorRef.current = null;
    }
    setDocumentKey(key);
  }, []);

  const getBootstrapEditorHtml = useCallback((forDocumentKey: string) => {
    const b = bootstrapEditorRef.current;
    return b && b.documentKey === forDocumentKey ? b.html : null;
  }, []);

  const notifyNewBlankDocument = useCallback(() => {
    bootstrapEditorRef.current = null;
    setDocumentKey(`unsaved:${crypto.randomUUID()}`);
  }, []);

  const adoptSavedFilePath = useCallback((absolutePath: string) => {
    bootstrapEditorRef.current = null;
    setDocumentKey(documentKeyFromAbsolutePath(absolutePath.trim()));
  }, []);

  const value = useMemo(
    (): DocumentWorkspaceValue => ({
      documentKey,
      documentLabel: formatDocumentLabel(documentKey),
      diskAbsolutePath,
      openedFolderAbsolutePath,
      isDirty,
      syncDocumentBaseline,
      noteEditorHtmlChanged,
      notifyOpenedLocalFile,
      notifyOpenedFromDisk,
      getBootstrapEditorHtml,
      notifyNewBlankDocument,
      adoptSavedFilePath,
    }),
    [
      documentKey,
      diskAbsolutePath,
      openedFolderAbsolutePath,
      isDirty,
      syncDocumentBaseline,
      noteEditorHtmlChanged,
      notifyOpenedLocalFile,
      notifyOpenedFromDisk,
      getBootstrapEditorHtml,
      notifyNewBlankDocument,
      adoptSavedFilePath,
    ],
  );

  return (
    <DocumentWorkspaceContext.Provider value={value}>{children}</DocumentWorkspaceContext.Provider>
  );
}

export function useDocumentWorkspace(): DocumentWorkspaceValue {
  const ctx = useContext(DocumentWorkspaceContext);
  if (!ctx) {
    throw new Error('useDocumentWorkspace must be used within DocumentWorkspaceProvider');
  }
  return ctx;
}
