import type { Editor } from '@tiptap/core';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import { Bold, Heading2, Italic, List, Underline as UnderlineIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

const bubbleClassName =
  'bg-popover text-popover-foreground flex flex-wrap gap-1 rounded-lg border border-border p-1 shadow-md';

const floatingClassName = bubbleClassName;

export function EditorSelectionMenus({ editor }: { editor: Editor }) {
  return (
    <>
      <BubbleMenu editor={editor} className={bubbleClassName}>
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
      <FloatingMenu editor={editor} className={floatingClassName}>
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
    </>
  );
}
