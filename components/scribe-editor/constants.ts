/* eslint-disable import/no-named-as-default -- Tiptap extension default exports */
import CharacterCount from '@tiptap/extension-character-count';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Dropcursor from '@tiptap/extension-dropcursor';
import Focus from '@tiptap/extension-focus';
import Gapcursor from '@tiptap/extension-gapcursor';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Table } from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import TextAlign from '@tiptap/extension-text-align';
import Typography from '@tiptap/extension-typography';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';
/* eslint-enable import/no-named-as-default */
import { common, createLowlight } from 'lowlight';

import { Callout } from './callout-extension';
import { SearchExtension } from './search-extension';
import { SlashMenu } from './slash-menu-extension';
import { buildSlashSuggestion } from './slash-menu-renderer';

const lowlight = createLowlight(common);

/** Blank document: one H1 (title) plus one empty paragraph. Placeholders render the hints. */
export const DEFAULT_DOC = '<h1></h1><p></p>';

export const EDITOR_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    codeBlock: false,
    dropcursor: false,
    gapcursor: false,
  }),
  Underline,
  Link.configure({
    openOnClick: false,
    autolink: true,
    linkOnPaste: true,
    HTMLAttributes: {
      class: 'scribe-editor-link',
      rel: 'noopener noreferrer nofollow',
    },
  }),
  Subscript,
  Superscript,
  TextAlign.configure({
    types: ['heading', 'paragraph'],
    defaultAlignment: 'left',
  }),
  Typography.configure({
    openDoubleQuote: '“',
    closeDoubleQuote: '”',
    openSingleQuote: '‘',
    closeSingleQuote: '’',
  }),
  Placeholder.configure({
    showOnlyCurrent: false,
    placeholder: ({ node, editor }) => {
      if (node.type.name === 'heading' && node.attrs.level === 1) {
        return 'Untitled';
      }
      if (node.type.name === 'heading') {
        return `Heading ${node.attrs.level}`;
      }
      if (node.type.name === 'paragraph') {
        const isFirst = editor.state.doc.firstChild === node;
        if (isFirst) return 'Press / for commands, or just start writing…';
        return '';
      }
      return '';
    },
  }),
  CharacterCount.configure({ limit: null }),
  Focus.configure({ className: 'has-focus', mode: 'shallowest' }),
  Dropcursor.configure({ color: 'var(--scribe-prose-accent)', width: 2 }),
  Gapcursor,
  Image.configure({
    inline: false,
    allowBase64: true,
    HTMLAttributes: { class: 'scribe-editor-image' },
  }),
  Table.configure({
    resizable: true,
    lastColumnResizable: true,
    allowTableNodeSelection: true,
  }),
  TableRow,
  TableHeader,
  TableCell,
  TaskList.configure({ HTMLAttributes: { class: 'scribe-task-list' } }),
  TaskItem.configure({ nested: true }),
  CodeBlockLowlight.configure({ lowlight, defaultLanguage: 'plaintext' }),
  Callout,
  SearchExtension,
  SlashMenu.configure({ suggestion: buildSlashSuggestion() }),
];

export const AUTOCOMPLETE_DEBOUNCE_MS = 420;
