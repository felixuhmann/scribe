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

const menubarTriggerClass = 'h-7 px-2 py-0 text-xs';

export type EditorMenubarProps = {
  editor: Editor | null;
  mod: string;
  canUndo: boolean;
  canRedo: boolean;
  textAlign: AlignValue;
  onNewDocument: () => void;
  onOpenFile: () => void;
  onSaveDocument: () => void;
  onSaveHtmlAs: () => void;
  onSaveMarkdownAs: () => void;
  onExportPdf: () => void;
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
  onSaveMarkdownAs,
  onExportPdf,
  onOpenLink,
  onOpenSettings,
}: EditorMenubarProps) {
  const ed = editor;
  return (
    <Menubar className="h-auto min-h-0 flex-1 border-0 bg-transparent p-0 text-xs shadow-none">
      <MenubarMenu>
        <MenubarTrigger className={menubarTriggerClass}>Scribe</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={onOpenSettings}>
            Settings…
            <MenubarShortcut>{mod},</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className={menubarTriggerClass} disabled={!ed}>
          File
        </MenubarTrigger>
        <MenubarContent>
          <MenubarItem disabled={!ed} onSelect={onNewDocument}>
            New
            <MenubarShortcut>{mod}N</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled={!ed} onSelect={onOpenFile}>
            Open…
            <MenubarShortcut>{mod}O</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled={!ed} onSelect={onSaveDocument}>
            Save
            <MenubarShortcut>{mod}S</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled={!ed} onSelect={onSaveHtmlAs}>
            Save as HTML…
            <MenubarShortcut>⇧{mod}S</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled={!ed} onSelect={onSaveMarkdownAs}>
            Save as Markdown…
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem disabled={!ed} onSelect={onExportPdf}>
            Export PDF…
          </MenubarItem>
          <MenubarItem onSelect={() => window.print()}>
            Print…
            <MenubarShortcut>{mod}P</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className={menubarTriggerClass} disabled={!ed}>
          Edit
        </MenubarTrigger>
        <MenubarContent>
          <MenubarItem
            disabled={!ed || !canUndo}
            onSelect={() => ed?.chain().focus().undo().run()}
          >
            Undo
            <MenubarShortcut>{mod}Z</MenubarShortcut>
          </MenubarItem>
          <MenubarItem
            disabled={!ed || !canRedo}
            onSelect={() => ed?.chain().focus().redo().run()}
          >
            Redo
            <MenubarShortcut>{mod}Y</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem
            disabled={!ed}
            onSelect={() => {
              ed?.view.dom.focus();
              focusDomExec('cut');
            }}
          >
            Cut
            <MenubarShortcut>{mod}X</MenubarShortcut>
          </MenubarItem>
          <MenubarItem
            disabled={!ed}
            onSelect={() => {
              ed?.view.dom.focus();
              focusDomExec('copy');
            }}
          >
            Copy
            <MenubarShortcut>{mod}C</MenubarShortcut>
          </MenubarItem>
          <MenubarItem
            disabled={!ed}
            onSelect={() => {
              ed?.view.dom.focus();
              focusDomExec('paste');
            }}
          >
            Paste
            <MenubarShortcut>{mod}V</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem disabled={!ed} onSelect={() => ed?.chain().focus().selectAll().run()}>
            Select all
            <MenubarShortcut>{mod}A</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className={menubarTriggerClass} disabled={!ed}>
          Insert
        </MenubarTrigger>
        <MenubarContent>
          <MenubarItem disabled={!ed} onSelect={onOpenLink}>
            Link…
            <MenubarShortcut>{mod}K</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled={!ed} onSelect={() => ed?.chain().focus().setHorizontalRule().run()}>
            Page break
          </MenubarItem>
          <MenubarItem disabled={!ed} onSelect={() => ed?.chain().focus().setHardBreak().run()}>
            Line break
            <MenubarShortcut>Shift+Enter</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className={menubarTriggerClass} disabled={!ed}>
          Format
        </MenubarTrigger>
        <MenubarContent>
          <MenubarItem disabled={!ed} onSelect={() => ed?.chain().focus().toggleBold().run()}>
            Bold
            <MenubarShortcut>{mod}B</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled={!ed} onSelect={() => ed?.chain().focus().toggleItalic().run()}>
            Italic
            <MenubarShortcut>{mod}I</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled={!ed} onSelect={() => ed?.chain().focus().toggleUnderline().run()}>
            Underline
            <MenubarShortcut>{mod}U</MenubarShortcut>
          </MenubarItem>
          <MenubarItem disabled={!ed} onSelect={() => ed?.chain().focus().toggleStrike().run()}>
            Strikethrough
          </MenubarItem>
          <MenubarItem disabled={!ed} onSelect={() => ed?.chain().focus().toggleCode().run()}>
            Inline code
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem disabled={!ed} onSelect={() => ed?.chain().focus().toggleSubscript().run()}>
            Subscript
          </MenubarItem>
          <MenubarItem disabled={!ed} onSelect={() => ed?.chain().focus().toggleSuperscript().run()}>
            Superscript
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem
            disabled={!ed}
            onSelect={() =>
              ed?.chain().focus().unsetAllMarks().setParagraph().unsetTextAlign().run()
            }
          >
            Clear formatting
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className={menubarTriggerClass} disabled={!ed}>
          Paragraph
        </MenubarTrigger>
        <MenubarContent>
          <MenubarItem disabled={!ed} onSelect={() => ed?.chain().focus().setParagraph().run()}>
            Normal
          </MenubarItem>
          <MenubarItem
            disabled={!ed}
            onSelect={() => ed?.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            Heading 1
          </MenubarItem>
          <MenubarItem
            disabled={!ed}
            onSelect={() => ed?.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            Heading 2
          </MenubarItem>
          <MenubarItem
            disabled={!ed}
            onSelect={() => ed?.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            Heading 3
          </MenubarItem>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger disabled={!ed}>Alignment</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarRadioGroup
                value={textAlign}
                onValueChange={(v) => {
                  if (v && ed) {
                    ed.chain().focus().setTextAlign(v as AlignValue).run();
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
          <MenubarItem disabled={!ed} onSelect={() => ed?.chain().focus().toggleBulletList().run()}>
            Bulleted list
          </MenubarItem>
          <MenubarItem disabled={!ed} onSelect={() => ed?.chain().focus().toggleOrderedList().run()}>
            Numbered list
          </MenubarItem>
          <MenubarItem disabled={!ed} onSelect={() => ed?.chain().focus().toggleBlockquote().run()}>
            Quote
          </MenubarItem>
          <MenubarItem disabled={!ed} onSelect={() => ed?.chain().focus().toggleCodeBlock().run()}>
            Code block
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
