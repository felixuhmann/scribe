import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useState } from 'react';
import { Tiptap, useEditor } from '@tiptap/react';

import { useEditorSession } from '@/components/editor-session-context';
import { TabAutocomplete } from '@/lib/tiptap-tab-autocomplete-extension';

import { AUTOCOMPLETE_DEBOUNCE_MS, DEFAULT_DOC, EDITOR_EXTENSIONS } from './constants';
import { ScribeEditorChrome } from './editor-chrome';
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
  const { setEditor } = useEditorSession();

  useEffect(() => {
    setEditor(editor);
    return () => setEditor(null);
  }, [editor, setEditor]);

  const [tabAutocomplete, setTabAutocomplete] = useState({
    enabled: true,
    debounceMs: AUTOCOMPLETE_DEBOUNCE_MS,
  });

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

  useEditorTabAutocomplete(editor, tabAutocomplete);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Tiptap editor={editor}>
        <div className="bg-card flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ScribeEditorChrome onAiSettingsSaved={refreshTabAutocompleteSettings} />
          <div
            className="scribe-editor-desk min-h-0 flex-1 overflow-y-auto"
            role="presentation"
            aria-label="Document canvas"
          >
            <div className="scribe-editor-paper">
              <Tiptap.Content className="scribe-editor-content focus-within:outline-none" />
            </div>
          </div>
          <EditorSelectionMenus editor={editor} />
        </div>
      </Tiptap>
    </div>
  );
}
