import type { Editor } from '@tiptap/core';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type EditorSessionValue = {
  editor: Editor | null;
  setEditor: (editor: Editor | null) => void;
  /** Called after AI-related settings are saved (e.g. tab autocomplete refresh). */
  notifySettingsSaved: () => void;
  /** Register a handler for settings save; returns cleanup. */
  registerSettingsSavedHandler: (handler: () => void) => () => void;
  /** Open the insert-link dialog (handled in app chrome). */
  requestOpenLinkDialog: () => void;
  registerOpenLinkDialogHandler: (handler: () => void) => () => void;
};

const EditorSessionContext = createContext<EditorSessionValue | null>(null);

export function EditorSessionProvider({ children }: { children: ReactNode }) {
  const [editor, setEditorState] = useState<Editor | null>(null);
  const settingsSavedHandlerRef = useRef<(() => void) | null>(null);
  const openLinkDialogHandlerRef = useRef<(() => void) | null>(null);

  const setEditor = useCallback((next: Editor | null) => {
    setEditorState(next);
  }, []);

  const registerSettingsSavedHandler = useCallback((handler: () => void) => {
    settingsSavedHandlerRef.current = handler;
    return () => {
      if (settingsSavedHandlerRef.current === handler) {
        settingsSavedHandlerRef.current = null;
      }
    };
  }, []);

  const notifySettingsSaved = useCallback(() => {
    settingsSavedHandlerRef.current?.();
  }, []);

  const registerOpenLinkDialogHandler = useCallback((handler: () => void) => {
    openLinkDialogHandlerRef.current = handler;
    return () => {
      if (openLinkDialogHandlerRef.current === handler) {
        openLinkDialogHandlerRef.current = null;
      }
    };
  }, []);

  const requestOpenLinkDialog = useCallback(() => {
    openLinkDialogHandlerRef.current?.();
  }, []);

  const value = useMemo(
    () => ({
      editor,
      setEditor,
      notifySettingsSaved,
      registerSettingsSavedHandler,
      requestOpenLinkDialog,
      registerOpenLinkDialogHandler,
    }),
    [
      editor,
      setEditor,
      notifySettingsSaved,
      registerSettingsSavedHandler,
      requestOpenLinkDialog,
      registerOpenLinkDialogHandler,
    ],
  );

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
