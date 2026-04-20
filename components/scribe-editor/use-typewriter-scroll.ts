import type { Editor } from '@tiptap/core';
import { useEffect, type RefObject } from 'react';

/**
 * Keep the active caret at the vertical center of the canvas while writing.
 *
 * The CSS padding inside `.scribe-editor-canvas[data-typewriter='on']` reserves
 * space so the caret can physically reach the middle of the viewport; this hook
 * drives the scroll update on every selection/input so the caret line tracks it.
 */
export function useTypewriterScroll(
  editor: Editor | null,
  canvasRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || !editor) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        centerCaret(editor, canvas);
      });
    };

    const onTransaction = () => schedule();
    const onFocus = () => schedule();

    editor.on('transaction', onTransaction);
    editor.on('focus', onFocus);
    editor.on('update', onTransaction);

    schedule();

    return () => {
      editor.off('transaction', onTransaction);
      editor.off('focus', onFocus);
      editor.off('update', onTransaction);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [editor, enabled, canvasRef]);
}

function centerCaret(editor: Editor, canvas: HTMLDivElement) {
  const { view } = editor;
  if (!view || !view.hasFocus()) return;

  const { from } = view.state.selection;
  let caretTop: number | null = null;
  try {
    const coords = view.coordsAtPos(from);
    caretTop = (coords.top + coords.bottom) / 2;
  } catch {
    return;
  }
  if (caretTop == null) return;

  const rect = canvas.getBoundingClientRect();
  const canvasCenter = rect.top + rect.height / 2;
  const delta = caretTop - canvasCenter;
  if (Math.abs(delta) < 4) return;

  canvas.scrollBy({ top: delta, behavior: 'auto' });
}
