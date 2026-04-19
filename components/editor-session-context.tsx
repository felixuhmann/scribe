import type { Editor } from '@tiptap/core';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type EditorSessionValue = {
  editor: Editor | null;
  setEditor: (editor: Editor | null) => void;
};

const EditorSessionContext = createContext<EditorSessionValue | null>(null);

export function EditorSessionProvider({ children }: { children: ReactNode }) {
  const [editor, setEditorState] = useState<Editor | null>(null);
  const setEditor = useCallback((next: Editor | null) => {
    setEditorState(next);
  }, []);

  const value = useMemo(() => ({ editor, setEditor }), [editor, setEditor]);

  return (
    <EditorSessionContext.Provider value={value}>{children}</EditorSessionContext.Provider>
  );
}

export function useEditorSession(): EditorSessionValue {
  const ctx = useContext(EditorSessionContext);
  if (!ctx) {
    throw new Error('useEditorSession must be used within EditorSessionProvider');
  }
  return ctx;
}
