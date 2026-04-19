/* eslint-disable import/no-named-as-default -- Tiptap extension default exports */
import Link from '@tiptap/extension-link';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';
/* eslint-enable import/no-named-as-default */

export const DEFAULT_DOC = '<p>Start writing…</p>';

export const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
  }),
  Underline,
  Link.configure({
    openOnClick: false,
    HTMLAttributes: {
      class: 'scribe-editor-link',
    },
  }),
  Subscript,
  Superscript,
  TextAlign.configure({
    types: ['heading', 'paragraph'],
  }),
];

export const AUTOCOMPLETE_DEBOUNCE_MS = 420;
