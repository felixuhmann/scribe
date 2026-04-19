import type { Editor } from '@tiptap/core';
/* eslint-disable import/no-named-as-default -- Tiptap extension default exports */
import Link from '@tiptap/extension-link';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
/* eslint-enable import/no-named-as-default */
import { Tiptap, useEditor, useTiptap, useTiptapState } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
// eslint-disable-next-line import/no-named-as-default -- StarterKit default export
import StarterKit from '@tiptap/starter-kit';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  SplitSquareHorizontal,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Type,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@/components/ui/menubar';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const DEFAULT_DOC = '<p>Start writing…</p>';

const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
  }),
  Underline,
  Link.configure({
    openOnClick: false,
    HTMLAttributes: {
      class: 'scribe-editor-link',
    },
  }),
  Subscript,
  Superscript,
  TextAlign.configure({
    types: ['heading', 'paragraph'],
  }),
];

function useModLabel() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent)
    ? '⌘'
    : 'Ctrl+';
}

function focusDomExec(command: 'cut' | 'copy' | 'paste') {
  document.execCommand(command);
}

function LinkDialog({
  editor,
  open,
  onOpenChange,
}: {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (open) {
      const href = editor.getAttributes('link').href as string | undefined;
      setUrl(href ?? '');
    }
  }, [open, editor]);

  const apply = useCallback(() => {
    const trimmed = url.trim();
    if (trimmed === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      const chain = editor.chain().focus();
      const sel = editor.state.selection;
      if (sel.empty) {
        chain.insertContent(`<a href="${trimmed}">${trimmed}</a> `).run();
      } else {
        chain.extendMarkRange('link').setLink({ href: trimmed }).run();
      }
    }
    onOpenChange(false);
  }, [editor, onOpenChange, url]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Link</DialogTitle>
          <DialogDescription>Enter a URL. Leave blank to remove the link.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="scribe-link-url">Address</Label>
          <Input
            id="scribe-link-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                apply();
              }
            }}
          />
        </div>
        <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={apply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditorChrome() {
  const { editor } = useTiptap();
  const mod = useModLabel();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  const canUndo = useTiptapState((s) => s.editor.can().undo());
  const canRedo = useTiptapState((s) => s.editor.can().redo());

  const isBold = useTiptapState((s) => s.editor.isActive('bold'));
  const isItalic = useTiptapState((s) => s.editor.isActive('italic'));
  const isStrike = useTiptapState((s) => s.editor.isActive('strike'));
  const isUnderline = useTiptapState((s) => s.editor.isActive('underline'));
  const isCode = useTiptapState((s) => s.editor.isActive('code'));

  const blockStyle = useTiptapState((s) => {
    const e = s.editor;
    if (e.isActive('heading', { level: 1 })) return 'h1';
    if (e.isActive('heading', { level: 2 })) return 'h2';
    if (e.isActive('heading', { level: 3 })) return 'h3';
    return 'p';
  });

  const textAlign = useTiptapState((s) => {
    const e = s.editor;
    if (e.isActive({ textAlign: 'justify' })) return 'justify';
    if (e.isActive({ textAlign: 'right' })) return 'right';
    if (e.isActive({ textAlign: 'center' })) return 'center';
    return 'left';
  });

  const markValues: string[] = [
    ...(isBold ? ['bold'] : []),
    ...(isItalic ? ['italic'] : []),
    ...(isStrike ? ['strike'] : []),
    ...(isUnderline ? ['underline'] : []),
    ...(isCode ? ['code'] : []),
  ];

  const wordCount = useTiptapState((state) => {
    const text = state.editor.state.doc.textContent;
    return text.split(/\s+/).filter(Boolean).length;
  });

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
    const blob = new Blob([`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Document</title></head><body>${html}</body></html>`], {
      type: 'text/html;charset=utf-8',
    });
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

      <header
        className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-50 flex shrink-0 flex-col border-b border-border backdrop-blur-sm"
        role="banner"
      >
        <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
          <Menubar className="h-auto min-h-8 flex-1 border-0 bg-transparent p-0 shadow-none">
            <MenubarMenu>
              <MenubarTrigger>File</MenubarTrigger>
              <MenubarContent>
                <MenubarItem
                  onSelect={() => {
                    newDocument();
                  }}
                >
                  New
                  <MenubarShortcut>{mod}N</MenubarShortcut>
                </MenubarItem>
                <MenubarItem onSelect={openFilePicker}>
                  Open…
                  <MenubarShortcut>{mod}O</MenubarShortcut>
                </MenubarItem>
                <MenubarItem onSelect={saveAsHtml}>
                  Save as…
                  <MenubarShortcut>{mod}S</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem
                  onSelect={() => {
                    window.print();
                  }}
                >
                  Print…
                  <MenubarShortcut>{mod}P</MenubarShortcut>
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Edit</MenubarTrigger>
              <MenubarContent>
                <MenubarItem
                  disabled={!canUndo}
                  onSelect={() => editor.chain().focus().undo().run()}
                >
                  Undo
                  <MenubarShortcut>{mod}Z</MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  disabled={!canRedo}
                  onSelect={() => editor.chain().focus().redo().run()}
                >
                  Redo
                  <MenubarShortcut>{mod}Y</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem
                  onSelect={() => {
                    editor.view.dom.focus();
                    focusDomExec('cut');
                  }}
                >
                  Cut
                  <MenubarShortcut>{mod}X</MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  onSelect={() => {
                    editor.view.dom.focus();
                    focusDomExec('copy');
                  }}
                >
                  Copy
                  <MenubarShortcut>{mod}C</MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  onSelect={() => {
                    editor.view.dom.focus();
                    focusDomExec('paste');
                  }}
                >
                  Paste
                  <MenubarShortcut>{mod}V</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem onSelect={() => editor.chain().focus().selectAll().run()}>
                  Select all
                  <MenubarShortcut>{mod}A</MenubarShortcut>
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Insert</MenubarTrigger>
              <MenubarContent>
                <MenubarItem onSelect={() => setLinkOpen(true)}>
                  Link…
                  <MenubarShortcut>{mod}K</MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  onSelect={() => editor.chain().focus().setHorizontalRule().run()}
                >
                  Page break
                </MenubarItem>
                <MenubarItem onSelect={() => editor.chain().focus().setHardBreak().run()}>
                  Line break
                  <MenubarShortcut>Shift+Enter</MenubarShortcut>
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Format</MenubarTrigger>
              <MenubarContent>
                <MenubarItem onSelect={() => editor.chain().focus().toggleBold().run()}>
                  Bold
                  <MenubarShortcut>{mod}B</MenubarShortcut>
                </MenubarItem>
                <MenubarItem onSelect={() => editor.chain().focus().toggleItalic().run()}>
                  Italic
                  <MenubarShortcut>{mod}I</MenubarShortcut>
                </MenubarItem>
                <MenubarItem onSelect={() => editor.chain().focus().toggleUnderline().run()}>
                  Underline
                  <MenubarShortcut>{mod}U</MenubarShortcut>
                </MenubarItem>
                <MenubarItem onSelect={() => editor.chain().focus().toggleStrike().run()}>
                  Strikethrough
                </MenubarItem>
                <MenubarItem onSelect={() => editor.chain().focus().toggleCode().run()}>
                  Inline code
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem
                  onSelect={() => editor.chain().focus().toggleSubscript().run()}
                >
                  Subscript
                </MenubarItem>
                <MenubarItem
                  onSelect={() => editor.chain().focus().toggleSuperscript().run()}
                >
                  Superscript
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem
                  onSelect={() =>
                    editor.chain().focus().unsetAllMarks().setParagraph().unsetTextAlign().run()
                  }
                >
                  Clear formatting
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Paragraph</MenubarTrigger>
              <MenubarContent>
                <MenubarItem onSelect={() => editor.chain().focus().setParagraph().run()}>
                  Normal
                </MenubarItem>
                <MenubarItem
                  onSelect={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                >
                  Heading 1
                </MenubarItem>
                <MenubarItem
                  onSelect={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                >
                  Heading 2
                </MenubarItem>
                <MenubarItem
                  onSelect={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                >
                  Heading 3
                </MenubarItem>
                <MenubarSeparator />
                <MenubarSub>
                  <MenubarSubTrigger>Alignment</MenubarSubTrigger>
                  <MenubarSubContent>
                    <MenubarRadioGroup
                      value={textAlign}
                      onValueChange={(v) => {
                        if (v) {
                          editor
                            .chain()
                            .focus()
                            .setTextAlign(v as 'left' | 'center' | 'right' | 'justify')
                            .run();
                        }
                      }}
                    >
                      <MenubarRadioItem value="left">Align left</MenubarRadioItem>
                      <MenubarRadioItem value="center">Align center</MenubarRadioItem>
                      <MenubarRadioItem value="right">Align right</MenubarRadioItem>
                      <MenubarRadioItem value="justify">Justify</MenubarRadioItem>
                    </MenubarRadioGroup>
                  </MenubarSubContent>
                </MenubarSub>
                <MenubarSeparator />
                <MenubarItem
                  onSelect={() => editor.chain().focus().toggleBulletList().run()}
                >
                  Bulleted list
                </MenubarItem>
                <MenubarItem
                  onSelect={() => editor.chain().focus().toggleOrderedList().run()}
                >
                  Numbered list
                </MenubarItem>
                <MenubarItem
                  onSelect={() => editor.chain().focus().toggleBlockquote().run()}
                >
                  Quote
                </MenubarItem>
                <MenubarItem
                  onSelect={() => editor.chain().focus().toggleCodeBlock().run()}
                >
                  Code block
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>

          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {wordCount} {wordCount === 1 ? 'word' : 'words'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="size-7 p-0"
              disabled={!canUndo}
              title="Undo"
              onClick={() => editor.chain().focus().undo().run()}
            >
              <Undo2 data-icon="inline-start" />
              <span className="sr-only">Undo</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="size-7 p-0"
              disabled={!canRedo}
              title="Redo"
              onClick={() => editor.chain().focus().redo().run()}
            >
              <Redo2 data-icon="inline-start" />
              <span className="sr-only">Redo</span>
            </Button>
          </div>

          <Separator orientation="vertical" className="hidden h-6 sm:block" decorative />

          <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            spacing={0}
            value={markValues}
            onValueChange={(next) => {
              const n = new Set(next);
              const ch = editor.chain().focus();
              if (n.has('bold') !== isBold) ch.toggleBold();
              if (n.has('italic') !== isItalic) ch.toggleItalic();
              if (n.has('strike') !== isStrike) ch.toggleStrike();
              if (n.has('underline') !== isUnderline) ch.toggleUnderline();
              if (n.has('code') !== isCode) ch.toggleCode();
              ch.run();
            }}
            aria-label="Character formatting"
          >
            <ToggleGroupItem value="bold" title="Bold">
              <Bold data-icon="inline-start" />
              <span className="sr-only">Bold</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="italic" title="Italic">
              <Italic data-icon="inline-start" />
              <span className="sr-only">Italic</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="underline" title="Underline">
              <UnderlineIcon data-icon="inline-start" />
              <span className="sr-only">Underline</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="strike" title="Strikethrough">
              <Strikethrough data-icon="inline-start" />
              <span className="sr-only">Strikethrough</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="code" title="Inline code">
              <span className="font-mono text-xs" aria-hidden>
                {'</>'}
              </span>
              <span className="sr-only">Inline code</span>
            </ToggleGroupItem>
          </ToggleGroup>

          <Separator orientation="vertical" className="hidden h-6 sm:block" decorative />

          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={blockStyle}
            onValueChange={(v) => {
              const mode = v ?? 'p';
              const ch = editor.chain().focus();
              if (mode === 'h1') ch.setHeading({ level: 1 });
              else if (mode === 'h2') ch.setHeading({ level: 2 });
              else if (mode === 'h3') ch.setHeading({ level: 3 });
              else ch.setParagraph();
              ch.run();
            }}
            aria-label="Paragraph style"
          >
            <ToggleGroupItem value="p" title="Body text">
              <Type data-icon="inline-start" />
              <span className="sr-only">Body text</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="h1" title="Heading 1">
              <Heading1 data-icon="inline-start" />
              <span className="sr-only">Heading 1</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="h2" title="Heading 2">
              <Heading2 data-icon="inline-start" />
              <span className="sr-only">Heading 2</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="h3" title="Heading 3">
              <Heading3 data-icon="inline-start" />
              <span className="sr-only">Heading 3</span>
            </ToggleGroupItem>
          </ToggleGroup>

          <Separator orientation="vertical" className="hidden h-6 sm:block" decorative />

          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={textAlign}
            onValueChange={(v) => {
              if (v) {
                editor.chain().focus().setTextAlign(v as 'left' | 'center' | 'right' | 'justify').run();
              }
            }}
            aria-label="Text alignment"
          >
            <ToggleGroupItem value="left" title="Align left">
              <AlignLeft data-icon="inline-start" />
              <span className="sr-only">Align left</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="center" title="Align center">
              <AlignCenter data-icon="inline-start" />
              <span className="sr-only">Align center</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="right" title="Align right">
              <AlignRight data-icon="inline-start" />
              <span className="sr-only">Align right</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="justify" title="Justify">
              <AlignJustify data-icon="inline-start" />
              <span className="sr-only">Justify</span>
            </ToggleGroupItem>
          </ToggleGroup>

          <Separator orientation="vertical" className="hidden h-6 sm:block" decorative />

          <ListToolbarToggles />

          <Separator orientation="vertical" className="hidden h-6 sm:block" decorative />

          <SubSuperToolbarToggles />

          <Separator orientation="vertical" className="hidden h-6 sm:block" decorative />

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => setLinkOpen(true)}
            title="Insert link"
          >
            <Link2 data-icon="inline-start" />
            <span className="max-sm:sr-only">Link</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Horizontal line (acts as a print page break)"
          >
            <SplitSquareHorizontal data-icon="inline-start" />
            <span className="max-sm:sr-only">Page break</span>
          </Button>
        </div>
      </header>
    </>
  );
}

function ListToolbarToggles() {
  const { editor } = useTiptap();
  const bullet = useTiptapState((s) => s.editor.isActive('bulletList'));
  const ordered = useTiptapState((s) => s.editor.isActive('orderedList'));
  const quote = useTiptapState((s) => s.editor.isActive('blockquote'));

  const listValues: string[] = [
    ...(bullet ? ['bullet'] : []),
    ...(ordered ? ['ordered'] : []),
    ...(quote ? ['quote'] : []),
  ];

  return (
    <ToggleGroup
      type="multiple"
      variant="outline"
      size="sm"
      spacing={0}
      value={listValues}
      onValueChange={(next) => {
        const n = new Set(next);
        const ch = editor.chain().focus();
        if (n.has('bullet') !== bullet) ch.toggleBulletList();
        if (n.has('ordered') !== ordered) ch.toggleOrderedList();
        if (n.has('quote') !== quote) ch.toggleBlockquote();
        ch.run();
      }}
      aria-label="Lists and quote"
    >
      <ToggleGroupItem value="bullet" title="Bulleted list">
        <List data-icon="inline-start" />
        <span className="sr-only">Bulleted list</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="ordered" title="Numbered list">
        <ListOrdered data-icon="inline-start" />
        <span className="sr-only">Numbered list</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="quote" title="Quote">
        <Quote data-icon="inline-start" />
        <span className="sr-only">Quote</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function SubSuperToolbarToggles() {
  const { editor } = useTiptap();
  const sub = useTiptapState((s) => s.editor.isActive('subscript'));
  const sup = useTiptapState((s) => s.editor.isActive('superscript'));

  const values: string[] = [...(sub ? ['sub'] : []), ...(sup ? ['super'] : [])];

  return (
    <ToggleGroup
      type="multiple"
      variant="outline"
      size="sm"
      spacing={0}
      value={values}
      onValueChange={(next) => {
        const n = new Set(next);
        const ch = editor.chain().focus();
        if (n.has('sub') !== sub) ch.toggleSubscript();
        if (n.has('super') !== sup) ch.toggleSuperscript();
        ch.run();
      }}
      aria-label="Subscript and superscript"
    >
      <ToggleGroupItem value="sub" title="Subscript">
        <SubscriptIcon data-icon="inline-start" />
        <span className="sr-only">Subscript</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="super" title="Superscript">
        <SuperscriptIcon data-icon="inline-start" />
        <span className="sr-only">Superscript</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function ScribeEditor() {
  const editor = useEditor({
    extensions: EDITOR_EXTENSIONS,
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
          <BubbleMenu className="bg-popover text-popover-foreground flex flex-wrap gap-1 rounded-lg border border-border p-1 shadow-md">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold data-icon="inline-start" />
              Bold
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic data-icon="inline-start" />
              Italic
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <UnderlineIcon data-icon="inline-start" />
              Underline
            </Button>
          </BubbleMenu>
          <FloatingMenu className="bg-popover text-popover-foreground flex flex-wrap gap-1 rounded-lg border border-border p-1 shadow-md">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <Heading2 data-icon="inline-start" />
              Heading
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List data-icon="inline-start" />
              List
            </Button>
          </FloatingMenu>
        </div>
      </Tiptap>
    </div>
  );
}
