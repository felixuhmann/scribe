import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  inferContentFormatFromDocumentKey,
  useDocumentWorkspace,
} from '@/components/document-workspace-context';
import { editorHtmlToMarkdown } from '@/lib/markdown/markdown-io';

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string }
  | { kind: 'dirty' };

export type SaveStatusSnapshot = {
  state: SaveState;
  /** Increments every 30s so relative "Saved N m ago" labels re-render. */
  tick: number;
};

const AUTOSAVE_DEBOUNCE_MS = 800;
const RELATIVE_TICK_MS = 30_000;

/**
 * Debounced autosave for the current editor HTML when the document is backed by a real disk file.
 * Also exposes a manual `flush()` for Cmd+S.
 */
export function useAutosave(editor: Editor | null): {
  status: SaveStatusSnapshot;
  flush: () => Promise<void>;
} {
  const { documentKey, diskAbsolutePath, isDirty, syncDocumentBaseline } = useDocumentWorkspace();
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const [tick, setTick] = useState(0);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  const doSave = useCallback(async (): Promise<void> => {
    if (!editor) return;
    if (!diskAbsolutePath) return;
    if (inFlightRef.current) return;
    const fmt = inferContentFormatFromDocumentKey(documentKey);
    const html = editor.getHTML();
    const toHtmlPath = window.scribe?.saveHtmlToPath;
    const toMdPath = window.scribe?.saveMarkdownToPath;
    inFlightRef.current = true;
    setState({ kind: 'saving' });
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
      setState({ kind: 'saved', at: Date.now() });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      setState({ kind: 'error', message });
    } finally {
      inFlightRef.current = false;
    }
  }, [diskAbsolutePath, documentKey, editor, syncDocumentBaseline]);

  useEffect(() => {
    if (!editor) return;
    if (!diskAbsolutePath) return;
    if (!isDirty) return;
    setState((prev) => (prev.kind === 'saving' ? prev : { kind: 'dirty' }));
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = setTimeout(() => {
      void doSave();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };
  }, [diskAbsolutePath, doSave, editor, isDirty]);

  useEffect(() => {
    setState({ kind: 'idle' });
  }, [documentKey]);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), RELATIVE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const flush = useCallback(async () => {
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    await doSave();
  }, [doSave]);

  return { status: { state, tick }, flush };
}
