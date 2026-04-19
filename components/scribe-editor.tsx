import { Tiptap, useEditor, useTiptap, useTiptapState } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
// eslint-disable-next-line import/no-named-as-default -- StarterKit default export
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading2, Italic, Strikethrough } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function EditorToolbar() {
  const { editor } = useTiptap();

  const isBold = useTiptapState((s) => s.editor.isActive('bold'));
  const isItalic = useTiptapState((s) => s.editor.isActive('italic'));
  const isStrike = useTiptapState((s) => s.editor.isActive('strike'));
  const isH2 = useTiptapState((s) => s.editor.isActive('heading', { level: 2 }));

  return (
    <div
      className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/40 px-2 py-1.5"
      role="toolbar"
      aria-label="Formatting"
    >
      <Button
        type="button"
        size="icon-sm"
        variant={isBold ? 'secondary' : 'ghost'}
        aria-pressed={isBold}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
      >
        <Bold className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant={isItalic ? 'secondary' : 'ghost'}
        aria-pressed={isItalic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
      >
        <Italic className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant={isStrike ? 'secondary' : 'ghost'}
        aria-pressed={isStrike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Strikethrough"
      >
        <Strikethrough className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant={isH2 ? 'secondary' : 'ghost'}
        aria-pressed={isH2}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading 2"
      >
        <Heading2 className="size-3.5" />
      </Button>
    </div>
  );
}

function WordCount() {
  const wordCount = useTiptapState((state) => {
    const text = state.editor.state.doc.textContent;
    return text.split(/\s+/).filter(Boolean).length;
  });

  return (
    <p className="text-muted-foreground border-t border-border px-3 py-1.5 text-xs tabular-nums">
      {wordCount} {wordCount === 1 ? 'word' : 'words'}
    </p>
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
        className="bg-muted/40 flex min-h-[min(50vh,22rem)] w-full animate-pulse rounded-xl border border-border"
        aria-hidden
      />
    );
  }

  return (
    <Tiptap editor={editor}>
      <div className="bg-card flex flex-col overflow-hidden rounded-xl border border-border shadow-sm">
        <EditorToolbar />
        <Tiptap.Content
          className={cn(
            'scribe-editor-content max-h-[min(60vh,28rem)] min-h-[min(50vh,22rem)] overflow-y-auto px-3 py-2 text-[0.9375rem] leading-relaxed',
            'focus-within:outline-none',
          )}
        />
        <BubbleMenu className="bg-popover text-popover-foreground flex gap-1 rounded-lg border border-border p-1 shadow-md">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="size-3.5" />
            Bold
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="size-3.5" />
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
            <Heading2 className="size-3.5" />
            Heading
          </Button>
        </FloatingMenu>
        <WordCount />
      </div>
    </Tiptap>
  );
}
