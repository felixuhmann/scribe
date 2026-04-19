import type { Editor } from '@tiptap/core';
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

import type { AlignValue } from './use-editor-chrome-state';
import { focusDomExec } from './utils';

export type EditorMenubarProps = {
  editor: Editor;
  mod: string;
  canUndo: boolean;
  canRedo: boolean;
  textAlign: AlignValue;
  onNewDocument: () => void;
  onOpenFile: () => void;
  onSaveDocument: () => void;
  onSaveHtmlAs: () => void;
  onOpenLink: () => void;
  onOpenSettings: () => void;
};

export function EditorMenubar({
  editor,
  mod,
  canUndo,
  canRedo,
  textAlign,
  onNewDocument,
  onOpenFile,
  onSaveDocument,
  onSaveHtmlAs,
  onOpenLink,
  onOpenSettings,
}: EditorMenubarProps) {
  return (
    <Menubar className="h-auto min-h-8 flex-1 border-0 bg-transparent p-0 shadow-none">
      <MenubarMenu>
        <MenubarTrigger>Scribe</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={onOpenSettings}>
            Settings…
            <MenubarShortcut>{mod},</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={onNewDocument}>
            New
            <MenubarShortcut>{mod}N</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={onOpenFile}>
            Open…
            <MenubarShortcut>{mod}O</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={onSaveDocument}>
            Save
            <MenubarShortcut>{mod}S</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={onSaveHtmlAs}>
            Save as…
            <MenubarShortcut>⇧{mod}S</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={() => window.print()}>
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
          <MenubarItem onSelect={onOpenLink}>
            Link…
            <MenubarShortcut>{mod}K</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => editor.chain().focus().setHorizontalRule().run()}>
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
          <MenubarItem onSelect={() => editor.chain().focus().toggleSubscript().run()}>
            Subscript
          </MenubarItem>
          <MenubarItem onSelect={() => editor.chain().focus().toggleSuperscript().run()}>
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
          <MenubarItem onSelect={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            Heading 1
          </MenubarItem>
          <MenubarItem onSelect={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            Heading 2
          </MenubarItem>
          <MenubarItem onSelect={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
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
                    editor.chain().focus().setTextAlign(v as AlignValue).run();
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
          <MenubarItem onSelect={() => editor.chain().focus().toggleBulletList().run()}>
            Bulleted list
          </MenubarItem>
          <MenubarItem onSelect={() => editor.chain().focus().toggleOrderedList().run()}>
            Numbered list
          </MenubarItem>
          <MenubarItem onSelect={() => editor.chain().focus().toggleBlockquote().run()}>
            Quote
          </MenubarItem>
          <MenubarItem onSelect={() => editor.chain().focus().toggleCodeBlock().run()}>
            Code block
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
