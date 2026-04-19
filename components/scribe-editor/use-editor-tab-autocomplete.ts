import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useRef } from 'react';

import { AUTOCOMPLETE_DEBOUNCE_MS } from './constants';

export function useEditorTabAutocomplete(editor: Editor) {
  const requestSeq = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDebounce = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  useEffect(() => {
    const runSuggest = async (anchorPos: number) => {
      const api = window.scribe?.autocompleteSuggest;
      if (!api) return;

      const before = editor.state.doc.textBetween(0, anchorPos, '\n', '\n').slice(-6000);
      const docEnd = editor.state.doc.content.size;
      const after = editor.state.doc.textBetween(anchorPos, docEnd, '\n', '\n').slice(0, 800);

      if (before.trim().length < 2 && after.trim().length < 2) {
        editor.commands.setTabAutocompleteGhost(null, null);
        return;
      }

      const seq = ++requestSeq.current;
      const result = await api({ before, after });
      if (seq !== requestSeq.current) return;

      if (!result.ok) {
        if ('cancelled' in result && result.cancelled) return;
        editor.commands.setTabAutocompleteGhost(null, null);
        return;
      }

      const text = result.text.trim();
      const { from, empty } = editor.state.selection;
      if (!empty || from !== anchorPos) return;

      if (!text) {
        editor.commands.setTabAutocompleteGhost(null, null);
        return;
      }

      editor.commands.setTabAutocompleteGhost(text, anchorPos);
    };

    const schedule = () => {
      clearDebounce();
      if (!editor.state.selection.empty) {
        editor.commands.setTabAutocompleteGhost(null, null);
        return;
      }
      const anchorPos = editor.state.selection.from;
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void runSuggest(anchorPos);
      }, AUTOCOMPLETE_DEBOUNCE_MS);
    };

    editor.on('update', schedule);
    editor.on('selectionUpdate', schedule);

    return () => {
      editor.off('update', schedule);
      editor.off('selectionUpdate', schedule);
      clearDebounce();
      requestSeq.current += 1;
      editor.commands.setTabAutocompleteGhost(null, null);
    };
  }, [editor, clearDebounce]);
}
