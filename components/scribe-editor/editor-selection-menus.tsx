import type { Editor } from '@tiptap/core';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import { Heading2, List, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const bubbleClassName =
  'bg-popover text-popover-foreground flex max-w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 rounded-lg border border-border p-2 shadow-md';

const floatingClassName =
  'bg-popover text-popover-foreground flex flex-wrap gap-1 rounded-lg border border-border p-1 shadow-md';

/** Escape text so it can be inserted as HTML inline content; newlines become line breaks. */
function plainTextToSafeInlineHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

export function EditorSelectionMenus({ editor }: { editor: Editor }) {
  const [instruction, setInstruction] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const sync = () => {
      const empty = editor.state.selection.empty;
      setSelectionOpen(!empty && editor.isEditable);
      if (empty) {
        setInstruction('');
        setError(null);
      }
    };
    editor.on('selectionUpdate', sync);
    editor.on('transaction', sync);
    sync();
    return () => {
      editor.off('selectionUpdate', sync);
      editor.off('transaction', sync);
    };
  }, [editor]);

  useEffect(() => {
    if (!selectionOpen || pending) return;
    const id = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [selectionOpen, pending]);

  const applyReplacement = useCallback(
    (from: number, to: number, replacementPlain: string) => {
      const html = plainTextToSafeInlineHtml(replacementPlain);
      editor.chain().focus().insertContentAt({ from, to }, html).run();
    },
    [editor],
  );

  const onSubmit = useCallback(async () => {
    const trimmed = instruction.trim();
    if (!trimmed || pending) return;

    const { from, to } = editor.state.selection;
    if (from === to) {
      setError('Select some text first.');
      return;
    }

    const selectedText = editor.state.doc.textBetween(from, to, '\n');
    setError(null);
    setPending(true);

    const api = typeof window !== 'undefined' ? window.scribe?.quickEditSelection : undefined;
    if (!api) {
      setPending(false);
      setError('Quick edit runs in the Scribe desktop app with an OpenAI API key.');
      return;
    }

    const result = await api({ selectedText, instruction: trimmed });
    setPending(false);

    if (!result.ok) {
      if ('cancelled' in result && result.cancelled) return;
      setError('error' in result ? result.error : 'Quick edit failed');
      return;
    }

    setInstruction('');
    applyReplacement(from, to, result.text);
  }, [applyReplacement, editor, instruction, pending]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void onSubmit();
      }
    },
    [onSubmit],
  );

  return (
    <>
      <BubbleMenu editor={editor} className={bubbleClassName}>
        <label className="sr-only" htmlFor="scribe-quick-edit-instruction">
          Describe how to change the selection
        </label>
        <Textarea
          ref={textareaRef}
          id="scribe-quick-edit-instruction"
          placeholder="Describe how to change this selection…"
          value={instruction}
          disabled={pending}
          rows={3}
          className="text-sm"
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">⌘↵ / Ctrl+Enter to apply</p>
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={pending || !instruction.trim()}
            onClick={() => void onSubmit()}
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                Applying…
              </>
            ) : (
              'Apply'
            )}
          </Button>
        </div>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
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
