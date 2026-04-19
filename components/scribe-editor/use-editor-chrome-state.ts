import { useTiptap, useTiptapState } from '@tiptap/react';
import { useMemo } from 'react';

import { useModLabel } from './utils';

export type BlockStyle = 'p' | 'h1' | 'h2' | 'h3';
export type AlignValue = 'left' | 'center' | 'right' | 'justify';

export function useEditorChromeState() {
  const { editor } = useTiptap();
  const mod = useModLabel();

  const canUndo = useTiptapState((s) => s.editor.can().undo());
  const canRedo = useTiptapState((s) => s.editor.can().redo());

  const isBold = useTiptapState((s) => s.editor.isActive('bold'));
  const isItalic = useTiptapState((s) => s.editor.isActive('italic'));
  const isStrike = useTiptapState((s) => s.editor.isActive('strike'));
  const isUnderline = useTiptapState((s) => s.editor.isActive('underline'));
  const isCode = useTiptapState((s) => s.editor.isActive('code'));

  const blockStyle = useTiptapState((s) => {
    const e = s.editor;
    if (e.isActive('heading', { level: 1 })) return 'h1' as const;
    if (e.isActive('heading', { level: 2 })) return 'h2' as const;
    if (e.isActive('heading', { level: 3 })) return 'h3' as const;
    return 'p' as const;
  });

  const textAlign = useTiptapState((s) => {
    const e = s.editor;
    if (e.isActive({ textAlign: 'justify' })) return 'justify' as const;
    if (e.isActive({ textAlign: 'right' })) return 'right' as const;
    if (e.isActive({ textAlign: 'center' })) return 'center' as const;
    return 'left' as const;
  });

  const markValues = useMemo(
    () =>
      [
        ...(isBold ? ['bold'] : []),
        ...(isItalic ? ['italic'] : []),
        ...(isStrike ? ['strike'] : []),
        ...(isUnderline ? ['underline'] : []),
        ...(isCode ? ['code'] : []),
      ] as string[],
    [isBold, isItalic, isStrike, isUnderline, isCode],
  );

  const wordCount = useTiptapState((state) => {
    const text = state.editor.state.doc.textContent;
    return text.split(/\s+/).filter(Boolean).length;
  });

  return {
    editor,
    mod,
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
    wordCount,
  };
}
