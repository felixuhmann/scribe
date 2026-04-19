import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { useDocumentWorkspace } from '@/components/document-workspace-context';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { LinkDialog } from './link-dialog';
import { EditorFormattingToolbar } from './editor-formatting-toolbar';
import { EditorMenubar } from './editor-menubar';
import { SettingsDialog } from './settings-dialog';
import { useEditorChromeState } from './use-editor-chrome-state';

export type ScribeEditorChromeProps = {
  onAiSettingsSaved?: () => void;
};

export function ScribeEditorChrome({ onAiSettingsSaved }: ScribeEditorChromeProps) {
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

  const openDocument = useCallback(async () => {
    const api = window.scribe?.openHtmlDocument;
    if (api) {
      const result = await api();
      if (!result.ok) return;
      notifyOpenedFromDisk(result.path);
      editor.chain().focus().setContent(result.html, { emitUpdate: true }).run();
      return;
    }
    openFilePicker();
  }, [editor, notifyOpenedFromDisk]);

  const onFileChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void file.text().then((html) => {
      notifyOpenedLocalFile(file);
      editor.chain().focus().setContent(html, { emitUpdate: true }).run();
    });
  };

  const saveAsHtml = useCallback(async () => {
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
  }, [adoptSavedFilePath, diskAbsolutePath, editor, syncDocumentBaseline]);

  const saveDocument = useCallback(async () => {
    const htmlBody = editor.getHTML();
    const toPath = window.scribe?.saveHtmlToPath;
    const asDialog = window.scribe?.saveHtmlAs;
    if (diskAbsolutePath && toPath) {
      const result = await toPath(diskAbsolutePath, htmlBody);
      if (result.ok) {
        syncDocumentBaseline(htmlBody);
      }
      return;
    }
    if (asDialog) {
      const result = await asDialog({
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
  }, [adoptSavedFilePath, diskAbsolutePath, editor, saveAsHtml, syncDocumentBaseline]);

  const newDocument = () => {
    notifyNewBlankDocument();
    editor.chain().focus().setContent('<p></p>', { emitUpdate: true }).run();
  };

  /** Whenever the logical document changes, treat the current editor HTML as the saved baseline. */
  useEffect(() => {
    syncDocumentBaseline(editor.getHTML());
  }, [documentKey, editor, syncDocumentBaseline]);

  useEffect(() => {
    const onUpdate = () => {
      noteEditorHtmlChanged(editor.getHTML());
    };
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
    };
  }, [editor, noteEditorHtmlChanged]);

  useEffect(() => {
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
  }, [saveAsHtml, saveDocument]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".html,.htm,.txt,text/html"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={onFileChosen}
      />
      <LinkDialog editor={editor} open={linkOpen} onOpenChange={setLinkOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} onSaved={onAiSettingsSaved} />

      <header
        className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-50 flex shrink-0 flex-col border-b border-border backdrop-blur-sm"
        role="banner"
      >
        <div className="flex h-16 shrink-0 items-center gap-2 px-3">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
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
              onOpenLink={() => setLinkOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </div>
        </div>

        <EditorFormattingToolbar
          {...toolChrome}
          onOpenLink={() => setLinkOpen(true)}
        />
      </header>
    </>
  );
}
