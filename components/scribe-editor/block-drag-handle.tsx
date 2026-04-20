import { DragHandle } from '@tiptap/extension-drag-handle-react';
import type { Editor } from '@tiptap/react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { GripVertical, Plus } from 'lucide-react';
import { useCallback, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Renders the per-block drag grip + add-below ("+") affordance in the editor canvas gutter.
 * Uses Tiptap's DragHandle plugin which handles positioning relative to the hovered node.
 */
export function BlockDragHandle({ editor }: { editor: Editor | null }) {
  const [activeNode, setActiveNode] = useState<{ node: ProseMirrorNode; pos: number } | null>(null);

  const onNodeChange = useCallback(
    (data: { node: ProseMirrorNode | null; editor: Editor; pos: number }) => {
      if (!data.node) {
        setActiveNode(null);
        return;
      }
      setActiveNode({ node: data.node, pos: data.pos });
    },
    [],
  );

  const insertBlockBelow = useCallback(() => {
    if (!editor || !activeNode) return;
    const end = activeNode.pos + activeNode.node.nodeSize;
    editor
      .chain()
      .focus()
      .insertContentAt(end, { type: 'paragraph' })
      .setTextSelection(end + 1)
      .run();
  }, [activeNode, editor]);

  if (!editor) return null;

  return (
    <DragHandle
      editor={editor}
      className="scribe-block-handle pointer-events-auto"
      onNodeChange={onNodeChange}
    >
      <div className={cn('flex items-center gap-0.5 rounded-md border border-transparent')}>
        <button
          type="button"
          className={cn(
            'flex size-6 items-center justify-center rounded-md text-muted-foreground/70',
            'hover:bg-muted hover:text-foreground',
          )}
          onMouseDown={(e) => {
            e.preventDefault();
            insertBlockBelow();
          }}
          aria-label="Insert block below"
          title="Click to insert a block below"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          className={cn(
            'flex size-6 cursor-grab items-center justify-center rounded-md text-muted-foreground/70',
            'hover:bg-muted hover:text-foreground active:cursor-grabbing',
          )}
          aria-label="Drag to move block"
          title="Drag to move, click for options"
        >
          <GripVertical className="size-4" />
        </button>
      </div>
    </DragHandle>
  );
}
