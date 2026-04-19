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

const STORAGE_KEY = 'scribe.documentKey';

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
    if (v && v.trim() !== '') return v;
  } catch {
    /* ignore */
  }
  return 'scratch';
}

export function formatDocumentLabel(documentKey: string): string {
  const key = documentKey.trim() || 'scratch';
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

type DocumentWorkspaceValue = {
  documentKey: string;
  documentLabel: string;
  /** Absolute path when this document is backed by a real file (Save without dialog). */
  diskAbsolutePath: string | null;
  isDirty: boolean;
  /** Call after loading/replacing editor content so “dirty” compares to this snapshot. */
  syncDocumentBaseline: (html: string) => void;
  /** Editor content changed; updates dirty vs baseline (no-op until baseline is set). */
  noteEditorHtmlChanged: (html: string) => void;
  notifyOpenedLocalFile: (file: File) => void;
  /** Prefer this in Electron: stable path-based key and disk saves. */
  notifyOpenedFromDisk: (absolutePath: string) => void;
  notifyNewBlankDocument: () => void;
  /** After Save As, point the workspace at the new path without reloading editor HTML. */
  adoptSavedFilePath: (absolutePath: string) => void;
};

const DocumentWorkspaceContext = createContext<DocumentWorkspaceValue | null>(null);

export function DocumentWorkspaceProvider({ children }: { children: ReactNode }) {
  const [documentKey, setDocumentKey] = useState(readStoredDocumentKey);
  const savedHtmlRef = useRef<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, documentKey);
    } catch {
      /* ignore */
    }
  }, [documentKey]);

  const syncDocumentBaseline = useCallback((html: string) => {
    savedHtmlRef.current = html;
    setIsDirty(false);
  }, []);

  const noteEditorHtmlChanged = useCallback((html: string) => {
    if (savedHtmlRef.current === null) return;
    setIsDirty(html !== savedHtmlRef.current);
  }, []);

  const notifyOpenedLocalFile = useCallback((file: File) => {
    setDocumentKey(`local:${file.name}:${file.lastModified}:${file.size}`);
  }, []);

  const notifyOpenedFromDisk = useCallback((absolutePath: string) => {
    setDocumentKey(documentKeyFromAbsolutePath(absolutePath.trim()));
  }, []);

  const notifyNewBlankDocument = useCallback(() => {
    setDocumentKey(`unsaved:${crypto.randomUUID()}`);
  }, []);

  const adoptSavedFilePath = useCallback((absolutePath: string) => {
    setDocumentKey(documentKeyFromAbsolutePath(absolutePath.trim()));
  }, []);

  const diskAbsolutePath = useMemo(() => absolutePathFromDocumentKey(documentKey), [documentKey]);

  const value = useMemo(
    (): DocumentWorkspaceValue => ({
      documentKey,
      documentLabel: formatDocumentLabel(documentKey),
      diskAbsolutePath,
      isDirty,
      syncDocumentBaseline,
      noteEditorHtmlChanged,
      notifyOpenedLocalFile,
      notifyOpenedFromDisk,
      notifyNewBlankDocument,
      adoptSavedFilePath,
    }),
    [
      documentKey,
      diskAbsolutePath,
      isDirty,
      syncDocumentBaseline,
      noteEditorHtmlChanged,
      notifyOpenedLocalFile,
      notifyOpenedFromDisk,
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
