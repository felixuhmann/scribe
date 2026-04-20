import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Tiptap, useEditor } from '@tiptap/react';

import { useDocumentWorkspace } from '@/components/document-workspace-context';
import { useEditorSession } from '@/components/editor-session-context';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { TabAutocomplete } from '@/components/scribe-editor/tiptap-tab-autocomplete-extension';

import { AUTOCOMPLETE_DEBOUNCE_MS, DEFAULT_DOC, EDITOR_EXTENSIONS } from './constants';
import { EditorFormattingToolbar } from './editor-formatting-toolbar';
import { ScribeEditorFooter } from './editor-footer';
import { useEditorChromeState } from './use-editor-chrome-state';
import { EditorSelectionMenus } from './editor-selection-menus';
import { useEditorTabAutocomplete } from './use-editor-tab-autocomplete';

export function ScribeEditor() {
  const editor = useEditor({
    extensions: [...EDITOR_EXTENSIONS, TabAutocomplete],
    content: DEFAULT_DOC,
    immediatelyRender: false,
  });

  if (!editor) {
    return (
      <div
        className="bg-muted/40 h-full min-h-0 w-full min-w-0 flex-1 animate-pulse border-b border-border"
        aria-hidden
      />
    );
  }

  return <ScribeEditorInner editor={editor} />;
}

function ScribeEditorInner({ editor }: { editor: Editor }) {
  const { documentKey, getBootstrapEditorHtml, syncDocumentBaseline } = useDocumentWorkspace();
  const { setEditor, registerSettingsSavedHandler, requestOpenLinkDialog } = useEditorSession();
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

  useEditorTabAutocomplete(editor, tabAutocomplete);

  useLayoutEffect(() => {
    const html = getBootstrapEditorHtml(documentKey);
    if (!html) return;
    editor.chain().focus().setContent(html, { emitUpdate: false }).run();
    syncDocumentBaseline(editor.getHTML());
  }, [documentKey, editor, getBootstrapEditorHtml, syncDocumentBaseline]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Tiptap editor={editor}>
        <div className="bg-card flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div
            className="border-border bg-card/80 flex shrink-0 items-center gap-2 border-b px-2 py-1"
            role="toolbar"
            aria-label="Document view controls"
          >
            <SidebarTrigger className="-ml-0.5" />
          </div>
          <EditorFormattingToolbar
            {...formattingChrome}
            editor={editor}
            onOpenLink={requestOpenLinkDialog}
          />
          <div
            className="scribe-editor-desk min-h-0 flex-1 overflow-y-auto"
            role="presentation"
            aria-label="Document canvas"
          >
            <div className="scribe-editor-paper">
              <Tiptap.Content className="scribe-editor-content focus-within:outline-none" />
            </div>
          </div>
          <ScribeEditorFooter
            autocompleteEnabled={tabAutocomplete.enabled}
            onToggleTabAutocomplete={() => void toggleTabAutocomplete()}
            togglePending={tabAutocompleteTogglePending}
          />
          <EditorSelectionMenus editor={editor} />
        </div>
      </Tiptap>
    </div>
  );
}
