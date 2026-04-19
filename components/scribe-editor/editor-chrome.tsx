import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import {
  inferContentFormatFromDocumentKey,
  useDocumentWorkspace,
} from '@/components/document-workspace-context';
import { useEditorSession } from '@/components/editor-session-context';
import { formatMarkdownFidelityPrompt, getMarkdownFidelityWarnings } from '@/lib/markdown-fidelity';
import { editorHtmlToMarkdown, markdownToEditorHtml } from '@/lib/markdown-io';
import { LinkDialog } from './link-dialog';
import { EditorMenubar } from './editor-menubar';
import { SettingsDialog } from './settings-dialog';
import { useEditorChromeState } from './use-editor-chrome-state';

export function ScribeEditorChrome() {
  const {
    notifySettingsSaved,
    registerOpenLinkDialogHandler,
    registerOpenDocumentFromDiskHandler,
  } = useEditorSession();
  const chrome = useEditorChromeState();
  const { mod, ...toolChrome } = chrome;
  const { editor } = toolChrome;
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
  const [settingsOpen, setSettingsOpen] = useState(false);

  const openFilePicker = () => fileInputRef.current?.click();

  const confirmMarkdownExportIfNeeded = useCallback((html: string): boolean => {
    const warnings = getMarkdownFidelityWarnings(html);
    if (warnings.length === 0) return true;
    return window.confirm(formatMarkdownFidelityPrompt(warnings));
  }, []);

  const openDocument = useCallback(async () => {
    if (!editor) return;
    const api = window.scribe?.openDocument;
    if (api) {
      const result = await api();
      if (!result.ok) return;
      notifyOpenedFromDisk(result.path);
      const html =
        result.format === 'markdown' ? markdownToEditorHtml(result.text) : result.text;
      editor.chain().focus().setContent(html, { emitUpdate: true }).run();
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
      const lower = file.name.toLowerCase();
      const html =
        lower.endsWith('.md') || lower.endsWith('.markdown')
          ? markdownToEditorHtml(text)
          : text;
      editor.chain().focus().setContent(html, { emitUpdate: true }).run();
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
    if (!confirmMarkdownExportIfNeeded(htmlBody)) return;
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
        if (!confirmMarkdownExportIfNeeded(htmlBody)) return;
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
      if (!confirmMarkdownExportIfNeeded(htmlBody)) return;
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
    return registerOpenDocumentFromDiskHandler(async (absolutePath: string) => {
      if (!editor) return;
      const api = window.scribe?.openDocumentAtPath;
      if (!api) return;
      const result = await api(absolutePath);
      if (!result.ok) return;
      notifyOpenedFromDisk(result.path);
      const html =
        result.format === 'markdown' ? markdownToEditorHtml(result.text) : result.text;
      editor.chain().focus().setContent(html, { emitUpdate: true }).run();
    });
  }, [editor, notifyOpenedFromDisk, registerOpenDocumentFromDiskHandler]);

  useEffect(() => {
    if (!editor) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setLinkOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey) {
          void saveAsHtml();
        } else {
          void saveDocument();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, saveAsHtml, saveDocument]);

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
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} onSaved={notifySettingsSaved} />

      <header
        className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-50 flex shrink-0 flex-col border-b border-border backdrop-blur-sm"
        role="banner"
      >
        <div className="flex h-9 shrink-0 items-center gap-1.5 px-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
            <EditorMenubar
              editor={editor}
              mod={mod}
              canUndo={toolChrome.canUndo}
              canRedo={toolChrome.canRedo}
              textAlign={toolChrome.textAlign}
              onNewDocument={newDocument}
              onOpenFile={openDocument}
              onSaveDocument={() => void saveDocument()}
              onSaveHtmlAs={() => void saveAsHtml()}
              onSaveMarkdownAs={() => void saveAsMarkdown()}
              onExportPdf={() => void exportPdf()}
              onOpenLink={() => setLinkOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </div>
        </div>

      </header>
    </>
  );
}
