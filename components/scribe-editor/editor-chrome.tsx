import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  inferContentFormatFromDocumentKey,
  useDocumentWorkspace,
} from '@/components/document-workspace-context';
import { useEditorSession } from '@/components/editor-session-context';
import { formatMarkdownFidelityPrompt, getMarkdownFidelityWarnings } from '@/components/scribe-editor/markdown-fidelity';
import {
  editorHtmlToMarkdown,
  localFileToEditorHtml,
  openDocumentResultToEditorHtml,
} from '@/lib/markdown/markdown-io';
import { CommandPalette } from './command-palette';
import { EditorTopBar } from './editor-top-bar';
import { InsertImageDialog } from './insert-image-dialog';
import { InsertTableDialog } from './insert-table-dialog';
import { LinkDialog } from './link-dialog';
import { OnboardingCoachmarks } from './onboarding-coachmarks';
import {
  OPEN_INSERT_IMAGE_DIALOG_EVENT,
  OPEN_INSERT_TABLE_DIALOG_EVENT,
} from './scribe-editor-events';
import { SettingsDialog } from './settings-dialog';
import { ShortcutsSheet } from './shortcuts-sheet';
import { useAutosave } from './use-autosave';
import { useEditorChromeState } from './use-editor-chrome-state';

function toggleThemeClass() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const isDark = root.classList.toggle('dark');
  try {
    localStorage.setItem('scribe.theme', isDark ? 'dark' : 'light');
  } catch {
    /* ignore */
  }
}

function syncStoredTheme() {
  if (typeof document === 'undefined') return;
  try {
    const stored = localStorage.getItem('scribe.theme');
    if (stored === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (stored === 'light') {
      document.documentElement.classList.remove('dark');
    }
  } catch {
    /* ignore */
  }
}

type MarkdownFidelityConfirmation = {
  warnings: string[];
  resolve: (confirmed: boolean) => void;
} | null;

export function ScribeEditorChrome() {
  const {
    notifySettingsSaved,
    registerOpenLinkDialogHandler,
    registerOpenInsertTableDialogHandler,
    registerOpenDocumentFromDiskHandler,
    isFormattingToolbarOpen,
    toggleFormattingToolbar,
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    setSearchBarOpen,
    canvas,
    autocompleteEnabled,
    requestToggleAutocomplete,
  } = useEditorSession();
  const chrome = useEditorChromeState();
  const { mod, ...toolChrome } = chrome;
  const { editor } = toolChrome;
  const { status: saveStatus, flush: flushAutosave } = useAutosave(editor);
  const {
    documentKey,
    diskAbsolutePath,

    syncDocumentBaseline,
    noteEditorHtmlChanged,
    notifyOpenedLocalFile,
    notifyOpenedFromDisk,
    notifyNewBlankDocument,
    adoptSavedFilePath,
  } = useDocumentWorkspace();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [insertTableOpen, setInsertTableOpen] = useState(false);
  const [insertImageOpen, setInsertImageOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [markdownFidelityConfirmation, setMarkdownFidelityConfirmation] =
    useState<MarkdownFidelityConfirmation>(null);

  const openFilePicker = () => fileInputRef.current?.click();

  const refocusEditorSoon = useCallback(() => {
    window.setTimeout(() => {
      if (!editor?.isDestroyed) editor?.view.focus();
    }, 0);
  }, [editor]);

  const resolveMarkdownFidelityConfirmation = useCallback(
    (confirmed: boolean) => {
      setMarkdownFidelityConfirmation((current) => {
        current?.resolve(confirmed);
        return null;
      });
      if (!confirmed) refocusEditorSoon();
    },
    [refocusEditorSoon],
  );

  const confirmMarkdownExportIfNeeded = useCallback((html: string): Promise<boolean> => {
    const warnings = getMarkdownFidelityWarnings(html);
    if (warnings.length === 0) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      setMarkdownFidelityConfirmation({ warnings, resolve });
    });
  }, []);

  const openDocument = useCallback(async () => {
    if (!editor) return;
    const api = window.scribe?.openDocument;
    if (api) {
      const result = await api();
      if (!result.ok) return;
      notifyOpenedFromDisk(result.path);
      editor
        .chain()
        .focus()
        .setContent(openDocumentResultToEditorHtml(result), { emitUpdate: true })
        .run();
      return;
    }
    openFilePicker();
  }, [editor, notifyOpenedFromDisk]);

  const onFileChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    void file.text().then((text) => {
      notifyOpenedLocalFile(file);
      editor
        .chain()
        .focus()
        .setContent(localFileToEditorHtml(file.name, text), { emitUpdate: true })
        .run();
    });
  };

  const saveAsHtml = useCallback(async () => {
    if (!editor) return;
    const htmlBody = editor.getHTML();
    const api = window.scribe?.saveHtmlAs;
    if (api) {
      const result = await api({
        htmlBody,
        defaultPath: diskAbsolutePath ?? undefined,
      });
      if (result.ok) {
        adoptSavedFilePath(result.path);
        syncDocumentBaseline(htmlBody);
      }
      return;
    }
    const blob = new Blob(
      [
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Document</title></head><body>${htmlBody}</body></html>`,
      ],
      { type: 'text/html;charset=utf-8' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'document.html';
    a.click();
    URL.revokeObjectURL(a.href);
    syncDocumentBaseline(htmlBody);
  }, [adoptSavedFilePath, diskAbsolutePath, editor, syncDocumentBaseline]);

  const saveAsMarkdown = useCallback(async () => {
    if (!editor) return;
    const htmlBody = editor.getHTML();
    if (!(await confirmMarkdownExportIfNeeded(htmlBody))) return;
    const markdown = editorHtmlToMarkdown(htmlBody);
    const api = window.scribe?.saveMarkdownAs;
    if (api) {
      const result = await api({
        markdown,
        defaultPath: diskAbsolutePath ?? undefined,
      });
      if (result.ok) {
        adoptSavedFilePath(result.path);
        syncDocumentBaseline(htmlBody);
      }
      return;
    }
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'document.md';
    a.click();
    URL.revokeObjectURL(a.href);
    syncDocumentBaseline(htmlBody);
  }, [
    adoptSavedFilePath,
    confirmMarkdownExportIfNeeded,
    diskAbsolutePath,
    editor,
    syncDocumentBaseline,
  ]);

  const saveDocument = useCallback(async () => {
    if (!editor) return;
    const htmlBody = editor.getHTML();
    const fmt = inferContentFormatFromDocumentKey(documentKey);
    const toHtmlPath = window.scribe?.saveHtmlToPath;
    const toMdPath = window.scribe?.saveMarkdownToPath;
    const asHtmlDialog = window.scribe?.saveHtmlAs;
    const asMdDialog = window.scribe?.saveMarkdownAs;

    if (diskAbsolutePath) {
      if (fmt === 'markdown') {
        if (!(await confirmMarkdownExportIfNeeded(htmlBody))) return;
        const markdown = editorHtmlToMarkdown(htmlBody);
        if (toMdPath) {
          const result = await toMdPath(diskAbsolutePath, markdown);
          if (result.ok) {
            syncDocumentBaseline(htmlBody);
          }
        }
        return;
      }
      if (toHtmlPath) {
        const result = await toHtmlPath(diskAbsolutePath, htmlBody);
        if (result.ok) {
          syncDocumentBaseline(htmlBody);
        }
      }
      return;
    }

    if (fmt === 'markdown') {
      if (!(await confirmMarkdownExportIfNeeded(htmlBody))) return;
      const markdown = editorHtmlToMarkdown(htmlBody);
      if (asMdDialog) {
        const result = await asMdDialog({
          markdown,
          defaultPath: diskAbsolutePath ?? undefined,
        });
        if (result.ok) {
          adoptSavedFilePath(result.path);
          syncDocumentBaseline(htmlBody);
        }
      } else {
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'document.md';
        a.click();
        URL.revokeObjectURL(a.href);
        syncDocumentBaseline(htmlBody);
      }
      return;
    }

    if (asHtmlDialog) {
      const result = await asHtmlDialog({
        htmlBody,
        defaultPath: diskAbsolutePath ?? undefined,
      });
      if (result.ok) {
        adoptSavedFilePath(result.path);
        syncDocumentBaseline(htmlBody);
      }
    } else {
      await saveAsHtml();
    }
  }, [
    adoptSavedFilePath,
    confirmMarkdownExportIfNeeded,
    diskAbsolutePath,
    documentKey,
    editor,
    saveAsHtml,
    syncDocumentBaseline,
  ]);

  const exportPdf = useCallback(async () => {
    if (!editor) return;
    const htmlBody = editor.getHTML();
    const api = window.scribe?.exportPdf;
    if (api) {
      await api({ htmlBody, defaultPath: diskAbsolutePath ?? undefined });
      return;
    }
    window.print();
  }, [diskAbsolutePath, editor]);

  const newDocument = () => {
    if (!editor) return;
    notifyNewBlankDocument();
    editor.chain().focus().setContent('<p></p>', { emitUpdate: true }).run();
  };

  /** Whenever the logical document changes, treat the current editor HTML as the saved baseline. */
  useEffect(() => {
    if (!editor) return;
    syncDocumentBaseline(editor.getHTML());
  }, [documentKey, editor, syncDocumentBaseline]);

  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => {
      noteEditorHtmlChanged(editor.getHTML());
    };
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
    };
  }, [editor, noteEditorHtmlChanged]);

  useEffect(() => {
    return registerOpenLinkDialogHandler(() => setLinkOpen(true));
  }, [registerOpenLinkDialogHandler]);

  useEffect(() => {
    return registerOpenInsertTableDialogHandler(() => setInsertTableOpen(true));
  }, [registerOpenInsertTableDialogHandler]);

  useEffect(() => {
    const handler = () => setInsertTableOpen(true);
    window.addEventListener(OPEN_INSERT_TABLE_DIALOG_EVENT, handler);
    return () => window.removeEventListener(OPEN_INSERT_TABLE_DIALOG_EVENT, handler);
  }, []);

  useEffect(() => {
    const handler = () => setInsertImageOpen(true);
    window.addEventListener(OPEN_INSERT_IMAGE_DIALOG_EVENT, handler);
    return () => window.removeEventListener(OPEN_INSERT_IMAGE_DIALOG_EVENT, handler);
  }, []);

  useEffect(() => {
    return registerOpenDocumentFromDiskHandler(async (absolutePath: string) => {
      if (!editor) return;
      const api = window.scribe?.openDocumentAtPath;
      if (!api) return;
      const result = await api(absolutePath);
      if (!result.ok) return;
      notifyOpenedFromDisk(result.path);
      editor
        .chain()
        .focus()
        .setContent(openDocumentResultToEditorHtml(result), { emitUpdate: true })
        .run();
    });
  }, [editor, notifyOpenedFromDisk, registerOpenDocumentFromDiskHandler]);

  useEffect(() => {
    syncStoredTheme();
  }, []);

  useEffect(() => {
    if (!editor) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) {
        if (!isEditable && e.key === '?' && !e.altKey) {
          e.preventDefault();
          setShortcutsOpen(true);
        }
        return;
      }
      const key = e.key.toLowerCase();
      if (key === '/' && e.shiftKey) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (key === 'k' && !e.shiftKey) {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      if (key === 'p' && e.shiftKey) {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      if (key === 'k' && e.shiftKey) {
        e.preventDefault();
        setLinkOpen(true);
        return;
      }
      if (key === 'f' && e.shiftKey) {
        e.preventDefault();
        canvas.toggleFocusMode();
        return;
      }
      if (key === 'f' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setSearchBarOpen(true);
        // If the bar is already open, refocus and select its input.
        window.setTimeout(() => {
          const input = document.querySelector<HTMLInputElement>(
            '[data-scribe-find-input]',
          );
          input?.focus();
          input?.select();
        }, 0);
        return;
      }
      if (e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }
      if (key === 's') {
        e.preventDefault();
        if (e.shiftKey) {
          void saveAsHtml();
        } else {
          void flushAutosave().then(() => {
            void saveDocument();
          });
        }
        return;
      }
      if (key === '=' || key === '+') {
        e.preventDefault();
        canvas.zoomIn();
        return;
      }
      if (key === '-') {
        e.preventDefault();
        canvas.zoomOut();
        return;
      }
      if (key === '0') {
        e.preventDefault();
        canvas.resetZoom();
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canvas, editor, flushAutosave, saveAsHtml, saveDocument, setCommandPaletteOpen, setSearchBarOpen]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".html,.htm,.txt,.md,.markdown,text/html,text/markdown"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={onFileChosen}
      />
      {editor ? (
        <LinkDialog editor={editor} open={linkOpen} onOpenChange={setLinkOpen} />
      ) : null}
      {editor ? (
        <InsertTableDialog
          editor={editor}
          open={insertTableOpen}
          onOpenChange={setInsertTableOpen}
        />
      ) : null}
      {editor ? (
        <InsertImageDialog
          editor={editor}
          open={insertImageOpen}
          onOpenChange={setInsertImageOpen}
        />
      ) : null}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} onSaved={notifySettingsSaved} />
      <ShortcutsSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} mod={mod} />
      <OnboardingCoachmarks mod={mod} />
      <AlertDialog
        open={markdownFidelityConfirmation !== null}
        onOpenChange={(open) => {
          if (!open) resolveMarkdownFidelityConfirmation(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Markdown may simplify this document</AlertDialogTitle>
            <AlertDialogDescription>
              {markdownFidelityConfirmation
                ? formatMarkdownFidelityPrompt(markdownFidelityConfirmation.warnings)
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" onClick={() => resolveMarkdownFidelityConfirmation(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction type="button" onClick={() => resolveMarkdownFidelityConfirmation(true)}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditorTopBar
        editor={editor}
        mod={mod}
        saveStatus={saveStatus}
        isFormattingToolbarOpen={isFormattingToolbarOpen}
        onToggleFormattingToolbar={toggleFormattingToolbar}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        canvas={canvas}
        onNewDocument={newDocument}
        onOpenFile={() => void openDocument()}
        onSaveDocument={() => void saveDocument()}
        onSaveHtmlAs={() => void saveAsHtml()}
        onSaveMarkdownAs={() => void saveAsMarkdown()}
        onExportPdf={() => void exportPdf()}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />
      <CommandPalette
        open={isCommandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        editor={editor}
        mod={mod}
        canvas={canvas}
        canUndo={toolChrome.canUndo}
        canRedo={toolChrome.canRedo}
        isFormattingToolbarOpen={isFormattingToolbarOpen}
        onToggleFormattingToolbar={toggleFormattingToolbar}
        onNewDocument={newDocument}
        onOpenFile={() => void openDocument()}
        onSaveDocument={() => void saveDocument()}
        onSaveHtmlAs={() => void saveAsHtml()}
        onSaveMarkdownAs={() => void saveAsMarkdown()}
        onExportPdf={() => void exportPdf()}
        onOpenLink={() => setLinkOpen(true)}
        onOpenInsertTable={() => setInsertTableOpen(true)}
        onOpenFind={() => setSearchBarOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onToggleTheme={toggleThemeClass}
        autocompleteEnabled={autocompleteEnabled}
        onToggleAutocomplete={requestToggleAutocomplete}
      />
    </>
  );
}
