import type { Editor } from '@tiptap/core';
import { Tiptap, useEditor } from '@tiptap/react';

import { TabAutocomplete } from '@/lib/tiptap-tab-autocomplete-extension';

import { DEFAULT_DOC, EDITOR_EXTENSIONS } from './constants';
import { EditorChrome } from './editor-chrome';
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
  useEditorTabAutocomplete(editor);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Tiptap editor={editor}>
        <div className="bg-card flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <EditorChrome />
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
