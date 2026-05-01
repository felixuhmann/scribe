import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Tiptap, useEditor } from '@tiptap/react';

import { useDocumentWorkspace } from '@/components/document-workspace-context';
import { useEditorSession } from '@/components/editor-session-context';
import { TabAutocomplete } from '@/components/scribe-editor/tiptap-tab-autocomplete-extension';
import { cn } from '@/lib/utils';

import { BlockDragHandle } from './block-drag-handle';
import { AUTOCOMPLETE_DEBOUNCE_MS, DEFAULT_DOC, EDITOR_EXTENSIONS } from './constants';
import { EditorFormattingToolbar } from './editor-formatting-toolbar';
import { ScribeEditorFooter } from './editor-footer';
import { EditorSearchBar } from './editor-search-bar';
import { LinkHoverCard } from './link-hover-card';
import { useEditorChromeState } from './use-editor-chrome-state';
import { EditorSelectionMenus } from './editor-selection-menus';
import { useEditorTabAutocomplete } from './use-editor-tab-autocomplete';
import { useTypewriterScroll } from './use-typewriter-scroll';

export function ScribeEditor() {
  const editor = useEditor({
    extensions: [...EDITOR_EXTENSIONS, TabAutocomplete],
    content: DEFAULT_DOC,
    immediatelyRender: false,
  });

  if (!editor) {
    return (
      <div
        className="bg-background h-full min-h-0 w-full min-w-0 flex-1 animate-pulse"
        aria-hidden
      />
    );
  }

  return <ScribeEditorInner editor={editor} />;
}

function ScribeEditorInner({ editor }: { editor: Editor }) {
  const { documentKey, getBootstrapEditorHtml, syncDocumentBaseline } = useDocumentWorkspace();
  const {
    setEditor,
    registerSettingsSavedHandler,
    requestOpenLinkDialog,
    isFormattingToolbarOpen,
    isSearchBarOpen,
    setSearchBarOpen,
    canvas,
    setAutocompleteState,
    registerToggleAutocompleteHandler,
  } = useEditorSession();
  const chrome = useEditorChromeState();
  const formattingChrome = ((ctx: typeof chrome) => {
    const { mod, wordCount, ...rest } = ctx;
    void mod;
    void wordCount;
    return rest;
  })(chrome);

  useEffect(() => {
    setEditor(editor);
    return () => setEditor(null);
  }, [editor, setEditor]);

  const [tabAutocomplete, setTabAutocomplete] = useState({
    enabled: true,
    debounceMs: AUTOCOMPLETE_DEBOUNCE_MS,
  });
  const [tabAutocompleteTogglePending, setTabAutocompleteTogglePending] = useState(false);

  const refreshTabAutocompleteSettings = useCallback(() => {
    const api = window.scribe?.getSettings;
    if (!api) return;
    void api().then((s) => {
      setTabAutocomplete({ enabled: s.autocompleteEnabled, debounceMs: s.autocompleteDebounceMs });
    });
  }, []);

  useEffect(() => {
    refreshTabAutocompleteSettings();
  }, [refreshTabAutocompleteSettings]);

  useEffect(() => {
    return registerSettingsSavedHandler(refreshTabAutocompleteSettings);
  }, [registerSettingsSavedHandler, refreshTabAutocompleteSettings]);

  const toggleTabAutocomplete = useCallback(async () => {
    const next = !tabAutocomplete.enabled;
    const api = window.scribe?.setSettings;
    if (!api) {
      setTabAutocomplete((prev) => ({ ...prev, enabled: next }));
      return;
    }
    setTabAutocompleteTogglePending(true);
    try {
      const s = await api({ autocompleteEnabled: next });
      setTabAutocomplete((prev) => ({
        ...prev,
        enabled: s.autocompleteEnabled,
        debounceMs: s.autocompleteDebounceMs,
      }));
    } finally {
      setTabAutocompleteTogglePending(false);
    }
  }, [tabAutocomplete.enabled]);

  useEffect(() => {
    setAutocompleteState(tabAutocomplete.enabled);
  }, [tabAutocomplete.enabled, setAutocompleteState]);

  useEffect(() => {
    return registerToggleAutocompleteHandler(() => toggleTabAutocomplete());
  }, [registerToggleAutocompleteHandler, toggleTabAutocomplete]);

  void tabAutocompleteTogglePending;

  useEditorTabAutocomplete(editor, tabAutocomplete);

  useLayoutEffect(() => {
    const html = getBootstrapEditorHtml(documentKey);
    if (!html) return;
    editor.chain().focus().setContent(html, { emitUpdate: false }).run();
    syncDocumentBaseline(editor.getHTML());
  }, [documentKey, editor, getBootstrapEditorHtml, syncDocumentBaseline]);

  const canvasStyle = useMemo<CSSProperties>(
    () => ({ '--scribe-content-scale': canvas.zoom } as CSSProperties),
    [canvas.zoom],
  );

  const canvasRef = useRef<HTMLDivElement>(null);
  useTypewriterScroll(editor, canvasRef, canvas.typewriterMode);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <Tiptap editor={editor}>
        <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {isFormattingToolbarOpen ? (
            <EditorFormattingToolbar
              {...formattingChrome}
              editor={editor}
              onOpenLink={requestOpenLinkDialog}
            />
          ) : null}
          <EditorSearchBar
            editor={editor}
            open={isSearchBarOpen}
            onClose={() => setSearchBarOpen(false)}
          />
          <div
            ref={canvasRef}
            className={cn('scribe-editor-canvas relative min-h-0 flex-1 overflow-y-auto')}
            data-focus-mode={canvas.focusMode ? 'on' : 'off'}
            data-typewriter={canvas.typewriterMode ? 'on' : 'off'}
            data-paper={canvas.paperMode ? 'on' : 'off'}
            style={canvasStyle}
            role="presentation"
            aria-label="Document canvas"
          >
            <div className="scribe-editor-column group">
              <Tiptap.Content className="scribe-editor-content focus-within:outline-none" />
              <BlockDragHandle editor={editor} />
            </div>
          </div>
          <ScribeEditorFooter autocompleteEnabled={tabAutocomplete.enabled} />
          <EditorSelectionMenus editor={editor} />
          <LinkHoverCard editor={editor} />
        </div>
      </Tiptap>
    </div>
  );
}
