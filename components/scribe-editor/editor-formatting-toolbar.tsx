import type { Editor } from '@tiptap/core';
import { useTiptap, useTiptapState } from '@tiptap/react';
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

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

import type { AlignValue, BlockStyle } from './use-editor-chrome-state';

function ToolbarSeparator() {
  return <Separator orientation="vertical" className="hidden h-6 sm:block" decorative />;
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

export type EditorFormattingToolbarProps = {
  editor: Editor;
  canUndo: boolean;
  canRedo: boolean;
  isBold: boolean;
  isItalic: boolean;
  isStrike: boolean;
  isUnderline: boolean;
  isCode: boolean;
  blockStyle: BlockStyle;
  textAlign: AlignValue;
  markValues: string[];
  onOpenLink: () => void;
};

export function EditorFormattingToolbar({
  editor,
  canUndo,
  canRedo,
  isBold,
  isItalic,
  isStrike,
  isUnderline,
  isCode,
  blockStyle,
  textAlign,
  markValues,
  onOpenLink,
}: EditorFormattingToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-2 py-1.5">
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

      <ToolbarSeparator />

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

      <ToolbarSeparator />

      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={blockStyle}
        onValueChange={(v) => {
          const mode = (v ?? 'p') as BlockStyle;
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

      <ToolbarSeparator />

      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={textAlign}
        onValueChange={(v) => {
          if (v) {
            editor.chain().focus().setTextAlign(v as AlignValue).run();
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

      <ToolbarSeparator />

      <ListToolbarToggles />

      <ToolbarSeparator />

      <SubSuperToolbarToggles />

      <ToolbarSeparator />

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={onOpenLink}
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
  );
}
