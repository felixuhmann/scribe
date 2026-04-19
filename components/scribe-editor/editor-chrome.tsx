import { useEffect, useRef, useState, type ChangeEvent } from 'react';

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
  const { mod, wordCount, ...toolChrome } = chrome;
  const { editor } = toolChrome;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const openFilePicker = () => fileInputRef.current?.click();

  const onFileChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void file.text().then((html) => {
      editor.chain().focus().setContent(html, { emitUpdate: true }).run();
    });
  };

  const saveAsHtml = () => {
    const html = editor.getHTML();
    const blob = new Blob(
      [
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Document</title></head><body>${html}</body></html>`,
      ],
      { type: 'text/html;charset=utf-8' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'document.html';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const newDocument = () => {
    editor.chain().focus().setContent('<p></p>', { emitUpdate: true }).run();
  };

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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
        <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
          <EditorMenubar
            editor={editor}
            mod={mod}
            canUndo={toolChrome.canUndo}
            canRedo={toolChrome.canRedo}
            textAlign={toolChrome.textAlign}
            onNewDocument={newDocument}
            onOpenFile={openFilePicker}
            onSaveHtml={saveAsHtml}
            onOpenLink={() => setLinkOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {wordCount} {wordCount === 1 ? 'word' : 'words'}
          </span>
        </div>

        <EditorFormattingToolbar
          {...toolChrome}
          onOpenLink={() => setLinkOpen(true)}
        />
      </header>
    </>
  );
}
