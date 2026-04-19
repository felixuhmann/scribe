import { useEditorState } from '@tiptap/react';
import { useMemo } from 'react';

import { useEditorSession } from '@/components/editor-session-context';

import { useModLabel } from './utils';

export type BlockStyle = 'p' | 'h1' | 'h2' | 'h3';
export type AlignValue = 'left' | 'center' | 'right' | 'justify';

export function useEditorChromeState() {
  const { editor } = useEditorSession();
  const mod = useModLabel();

  const tool = useEditorState({
    editor,
    selector: (ctx) => {
      const ed = ctx.editor;
      if (!ed) {
        return {
          canUndo: false,
          canRedo: false,
          isBold: false,
          isItalic: false,
          isStrike: false,
          isUnderline: false,
          isCode: false,
          blockStyle: 'p' as BlockStyle,
          textAlign: 'left' as AlignValue,
          wordCount: 0,
        };
      }
      const blockStyle: BlockStyle = ed.isActive('heading', { level: 1 })
        ? 'h1'
        : ed.isActive('heading', { level: 2 })
          ? 'h2'
          : ed.isActive('heading', { level: 3 })
            ? 'h3'
            : 'p';
      const textAlign: AlignValue = ed.isActive({ textAlign: 'justify' })
        ? 'justify'
        : ed.isActive({ textAlign: 'right' })
          ? 'right'
          : ed.isActive({ textAlign: 'center' })
            ? 'center'
            : 'left';
      const text = ed.state.doc.textContent;
      return {
        canUndo: ed.can().undo(),
        canRedo: ed.can().redo(),
        isBold: ed.isActive('bold'),
        isItalic: ed.isActive('italic'),
        isStrike: ed.isActive('strike'),
        isUnderline: ed.isActive('underline'),
        isCode: ed.isActive('code'),
        blockStyle,
        textAlign,
        wordCount: text.split(/\s+/).filter(Boolean).length,
      };
    },
  });

  const {
    canUndo,
    canRedo,
    isBold,
    isItalic,
    isStrike,
    isUnderline,
    isCode,
    blockStyle,
    textAlign,
    wordCount,
  } = tool ?? {
    canUndo: false,
    canRedo: false,
    isBold: false,
    isItalic: false,
    isStrike: false,
    isUnderline: false,
    isCode: false,
    blockStyle: 'p' as const,
    textAlign: 'left' as const,
    wordCount: 0,
  };

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
