import type { Editor } from '@tiptap/core';
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

import {
  useEditorCanvasPreferences,
  type CanvasPreferencesApi,
} from '@/components/scribe-editor/use-editor-canvas-preferences';

const FORMATTING_TOOLBAR_STORAGE_KEY = 'scribe.formattingToolbarOpen';

function readStoredFormattingToolbarOpen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(FORMATTING_TOOLBAR_STORAGE_KEY);
    if (raw === null) return false;
    return JSON.parse(raw) === true;
  } catch {
    return false;
  }
}

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
  /** Open the insert-table dialog (grid picker, handled in app chrome). */
  requestOpenInsertTableDialog: () => void;
  registerOpenInsertTableDialogHandler: (handler: () => void) => () => void;
  /**
   * Load a document from an absolute path (Electron). Implemented in editor chrome
   * so the same parsing and editor updates apply as for File → Open.
   */
  requestOpenDocumentFromDisk: (absolutePath: string) => Promise<void>;
  registerOpenDocumentFromDiskHandler: (
    handler: (absolutePath: string) => void | Promise<void>,
  ) => () => void;
  /** Legacy formatting ribbon is hidden by default; toggled from the top bar / palette. */
  isFormattingToolbarOpen: boolean;
  setFormattingToolbarOpen: (open: boolean) => void;
  toggleFormattingToolbar: () => void;
  /** Command palette open state is owned here so any surface can invoke it. */
  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  /** Find-in-document bar open state. */
  isSearchBarOpen: boolean;
  setSearchBarOpen: (open: boolean) => void;
  toggleSearchBar: () => void;
  /** Persisted canvas-view preferences (focus mode, typewriter, paper, zoom). */
  canvas: CanvasPreferencesApi;
  /**
   * Tab autocomplete state — owned by the editor component, mirrored here so
   * non-adjacent surfaces (command palette, settings) can read/toggle it.
   */
  autocompleteEnabled: boolean;
  setAutocompleteState: (enabled: boolean) => void;
  requestToggleAutocomplete: () => void;
  registerToggleAutocompleteHandler: (handler: () => void | Promise<void>) => () => void;
};

const EditorSessionContext = createContext<EditorSessionValue | null>(null);

export function EditorSessionProvider({ children }: { children: ReactNode }) {
  const [editor, setEditorState] = useState<Editor | null>(null);
  const settingsSavedHandlerRef = useRef<(() => void) | null>(null);
  const openLinkDialogHandlerRef = useRef<(() => void) | null>(null);
  const openInsertTableDialogHandlerRef = useRef<(() => void) | null>(null);
  const openDocumentFromDiskHandlerRef = useRef<
    ((absolutePath: string) => void | Promise<void>) | null
  >(null);

  const [isFormattingToolbarOpen, setFormattingToolbarOpen] = useState<boolean>(
    readStoredFormattingToolbarOpen,
  );
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        FORMATTING_TOOLBAR_STORAGE_KEY,
        JSON.stringify(isFormattingToolbarOpen),
      );
    } catch {
      /* ignore */
    }
  }, [isFormattingToolbarOpen]);
  const [isSearchBarOpen, setSearchBarOpen] = useState(false);
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(true);
  const toggleAutocompleteHandlerRef = useRef<(() => void | Promise<void>) | null>(null);
  const canvas = useEditorCanvasPreferences();

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

  const registerOpenInsertTableDialogHandler = useCallback((handler: () => void) => {
    openInsertTableDialogHandlerRef.current = handler;
    return () => {
      if (openInsertTableDialogHandlerRef.current === handler) {
        openInsertTableDialogHandlerRef.current = null;
      }
    };
  }, []);

  const requestOpenInsertTableDialog = useCallback(() => {
    openInsertTableDialogHandlerRef.current?.();
  }, []);

  const registerOpenDocumentFromDiskHandler = useCallback(
    (handler: (absolutePath: string) => void | Promise<void>) => {
      openDocumentFromDiskHandlerRef.current = handler;
      return () => {
        if (openDocumentFromDiskHandlerRef.current === handler) {
          openDocumentFromDiskHandlerRef.current = null;
        }
      };
    },
    [],
  );

  const requestOpenDocumentFromDisk = useCallback(async (absolutePath: string) => {
    await openDocumentFromDiskHandlerRef.current?.(absolutePath);
  }, []);

  const toggleFormattingToolbar = useCallback(
    () => setFormattingToolbarOpen((v) => !v),
    [],
  );
  const toggleCommandPalette = useCallback(() => setCommandPaletteOpen((v) => !v), []);
  const toggleSearchBar = useCallback(() => setSearchBarOpen((v) => !v), []);

  const registerToggleAutocompleteHandler = useCallback(
    (handler: () => void | Promise<void>) => {
      toggleAutocompleteHandlerRef.current = handler;
      return () => {
        if (toggleAutocompleteHandlerRef.current === handler) {
          toggleAutocompleteHandlerRef.current = null;
        }
      };
    },
    [],
  );

  const requestToggleAutocomplete = useCallback(() => {
    void toggleAutocompleteHandlerRef.current?.();
  }, []);

  const setAutocompleteState = useCallback((enabled: boolean) => {
    setAutocompleteEnabled(enabled);
  }, []);

  const value = useMemo(
    () => ({
      editor,
      setEditor,
      notifySettingsSaved,
      registerSettingsSavedHandler,
      requestOpenLinkDialog,
      registerOpenLinkDialogHandler,
      requestOpenInsertTableDialog,
      registerOpenInsertTableDialogHandler,
      requestOpenDocumentFromDisk,
      registerOpenDocumentFromDiskHandler,
      isFormattingToolbarOpen,
      setFormattingToolbarOpen,
      toggleFormattingToolbar,
      isCommandPaletteOpen,
      setCommandPaletteOpen,
      toggleCommandPalette,
      isSearchBarOpen,
      setSearchBarOpen,
      toggleSearchBar,
      canvas,
      autocompleteEnabled,
      setAutocompleteState,
      requestToggleAutocomplete,
      registerToggleAutocompleteHandler,
    }),
    [
      editor,
      setEditor,
      notifySettingsSaved,
      registerSettingsSavedHandler,
      requestOpenLinkDialog,
      registerOpenLinkDialogHandler,
      requestOpenInsertTableDialog,
      registerOpenInsertTableDialogHandler,
      requestOpenDocumentFromDisk,
      registerOpenDocumentFromDiskHandler,
      isFormattingToolbarOpen,
      toggleFormattingToolbar,
      isCommandPaletteOpen,
      toggleCommandPalette,
      isSearchBarOpen,
      toggleSearchBar,
      canvas,
      autocompleteEnabled,
      setAutocompleteState,
      requestToggleAutocomplete,
      registerToggleAutocompleteHandler,
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
