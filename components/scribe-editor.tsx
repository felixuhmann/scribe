import { Tiptap, useEditor, useTiptap, useTiptapState } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
// eslint-disable-next-line import/no-named-as-default -- StarterKit default export
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Heading2,
  Italic,
  SplitSquareHorizontal,
  Strikethrough,
  Type,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

function EditorToolbar() {
  const { editor } = useTiptap();

  const isBold = useTiptapState((s) => s.editor.isActive('bold'));
  const isItalic = useTiptapState((s) => s.editor.isActive('italic'));
  const isStrike = useTiptapState((s) => s.editor.isActive('strike'));
  const isH2 = useTiptapState((s) => s.editor.isActive('heading', { level: 2 }));

  const markValues: string[] = [
    ...(isBold ? ['bold'] : []),
    ...(isItalic ? ['italic'] : []),
    ...(isStrike ? ['strike'] : []),
  ];

  const wordCount = useTiptapState((state) => {
    const text = state.editor.state.doc.textContent;
    return text.split(/\s+/).filter(Boolean).length;
  });

  return (
    <header
      className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-50 flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 backdrop-blur-sm"
      role="banner"
    >
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
          ch.run();
        }}
        aria-label="Text formatting"
      >
        <ToggleGroupItem value="bold" title="Bold">
          <Bold data-icon="inline-start" />
          <span className="sr-only">Bold</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="italic" title="Italic">
          <Italic data-icon="inline-start" />
          <span className="sr-only">Italic</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="strike" title="Strikethrough">
          <Strikethrough data-icon="inline-start" />
          <span className="sr-only">Strikethrough</span>
        </ToggleGroupItem>
      </ToggleGroup>

      <Separator orientation="vertical" className="hidden h-6 sm:block" decorative />

      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={isH2 ? 'heading2' : 'text'}
        onValueChange={(v) => {
          const mode = v ?? 'text';
          if (mode === 'heading2') {
            editor.chain().focus().setHeading({ level: 2 }).run();
          } else {
            editor.chain().focus().setParagraph().run();
          }
        }}
        aria-label="Paragraph style"
      >
        <ToggleGroupItem value="text" title="Body text">
          <Type data-icon="inline-start" />
          <span className="sr-only">Body text</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="heading2" title="Heading 2">
          <Heading2 data-icon="inline-start" />
          <span className="sr-only">Heading 2</span>
        </ToggleGroupItem>
      </ToggleGroup>

      <Separator orientation="vertical" className="hidden h-6 sm:block" decorative />

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

      <div className="min-w-2 flex-1" aria-hidden />

      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {wordCount} {wordCount === 1 ? 'word' : 'words'}
      </span>
    </header>
  );
}

export function ScribeEditor() {
  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>Start writing…</p>',
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
          <EditorToolbar />
          <div
            className="scribe-editor-desk min-h-0 flex-1 overflow-y-auto"
            role="presentation"
            aria-label="Document canvas"
          >
            <div className="scribe-editor-paper">
              <Tiptap.Content className="scribe-editor-content focus-within:outline-none" />
            </div>
          </div>
          <BubbleMenu className="bg-popover text-popover-foreground flex gap-1 rounded-lg border border-border p-1 shadow-md">
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
          </BubbleMenu>
          <FloatingMenu className="bg-popover text-popover-foreground flex gap-1 rounded-lg border border-border p-1 shadow-md">
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
          </FloatingMenu>
        </div>
      </Tiptap>
    </div>
  );
}
