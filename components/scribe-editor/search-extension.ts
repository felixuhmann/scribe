import type { CommandProps } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type SearchMatch = { from: number; to: number };

export type SearchPluginState = {
  query: string;
  caseSensitive: boolean;
  results: SearchMatch[];
  /** Index into `results`. -1 when there is no active match. */
  currentIndex: number;
};

type SearchMeta =
  | { type: 'setQuery'; query: string; caseSensitive: boolean }
  | { type: 'setCurrent'; index: number }
  | { type: 'clear' };

export const searchPluginKey = new PluginKey<SearchPluginState>('scribeSearch');

const EMPTY_STATE: SearchPluginState = {
  query: '',
  caseSensitive: false,
  results: [],
  currentIndex: -1,
};

/** Walk all text nodes and collect every match of `query` (case sensitivity is configurable). */
function findMatches(
  state: EditorState,
  query: string,
  caseSensitive: boolean,
): SearchMatch[] {
  if (!query) return [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: SearchMatch[] = [];

  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const haystack = caseSensitive ? node.text : node.text.toLowerCase();
    let i = 0;
    while (i <= haystack.length - needle.length) {
      const found = haystack.indexOf(needle, i);
      if (found === -1) break;
      matches.push({ from: pos + found, to: pos + found + needle.length });
      i = found + needle.length;
    }
  });

  return matches;
}

/** Choose the match closest to (and not before) the current selection head. */
function pickIndexNearSelection(state: EditorState, results: SearchMatch[]): number {
  if (results.length === 0) return -1;
  const head = state.selection.from;
  for (let i = 0; i < results.length; i += 1) {
    if (results[i].from >= head) return i;
  }
  return 0;
}

function buildDecorations(state: EditorState, plugin: SearchPluginState): DecorationSet {
  if (plugin.results.length === 0) return DecorationSet.empty;
  const decos = plugin.results.map((m, i) =>
    Decoration.inline(m.from, m.to, {
      class:
        i === plugin.currentIndex
          ? 'scribe-search-match scribe-search-match-current'
          : 'scribe-search-match',
    }),
  );
  return DecorationSet.create(state.doc, decos);
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    scribeSearch: {
      setSearchQuery: (query: string, options?: { caseSensitive?: boolean }) => ReturnType;
      clearSearch: () => ReturnType;
      findNextMatch: () => ReturnType;
      findPreviousMatch: () => ReturnType;
      replaceCurrentMatch: (replacement: string) => ReturnType;
      replaceAllMatches: (replacement: string) => ReturnType;
    };
  }
}

export const SearchExtension = Extension.create({
  name: 'scribeSearch',

  addCommands() {
    return {
      setSearchQuery:
        (query: string, options?: { caseSensitive?: boolean }) =>
        ({ tr, dispatch }: CommandProps) => {
          if (!dispatch) return false;
          const meta: SearchMeta = {
            type: 'setQuery',
            query,
            caseSensitive: options?.caseSensitive ?? false,
          };
          dispatch(tr.setMeta(searchPluginKey, meta));
          return true;
        },

      clearSearch:
        () =>
        ({ tr, dispatch }: CommandProps) => {
          if (!dispatch) return false;
          const meta: SearchMeta = { type: 'clear' };
          dispatch(tr.setMeta(searchPluginKey, meta));
          return true;
        },

      findNextMatch:
        () =>
        ({ state, tr, dispatch }: CommandProps) => {
          const plugin = searchPluginKey.getState(state);
          if (!plugin || plugin.results.length === 0) return false;
          const next = (plugin.currentIndex + 1) % plugin.results.length;
          const target = plugin.results[next];
          if (dispatch) {
            const meta: SearchMeta = { type: 'setCurrent', index: next };
            const updated = tr
              .setMeta(searchPluginKey, meta)
              .setSelection(TextSelection.create(tr.doc, target.from, target.to))
              .scrollIntoView();
            dispatch(updated);
          }
          return true;
        },

      findPreviousMatch:
        () =>
        ({ state, tr, dispatch }: CommandProps) => {
          const plugin = searchPluginKey.getState(state);
          if (!plugin || plugin.results.length === 0) return false;
          const total = plugin.results.length;
          const prev = (plugin.currentIndex - 1 + total) % total;
          const target = plugin.results[prev];
          if (dispatch) {
            const meta: SearchMeta = { type: 'setCurrent', index: prev };
            const updated = tr
              .setMeta(searchPluginKey, meta)
              .setSelection(TextSelection.create(tr.doc, target.from, target.to))
              .scrollIntoView();
            dispatch(updated);
          }
          return true;
        },

      replaceCurrentMatch:
        (replacement: string) =>
        ({ state, tr, dispatch }: CommandProps) => {
          const plugin = searchPluginKey.getState(state);
          if (!plugin || plugin.results.length === 0) return false;
          const idx = plugin.currentIndex < 0 ? 0 : plugin.currentIndex;
          const target = plugin.results[idx];
          if (!target) return false;
          if (dispatch) {
            tr.insertText(replacement, target.from, target.to).scrollIntoView();
            dispatch(tr);
          }
          return true;
        },

      replaceAllMatches:
        (replacement: string) =>
        ({ state, tr, dispatch }: CommandProps) => {
          const plugin = searchPluginKey.getState(state);
          if (!plugin || plugin.results.length === 0) return false;
          if (dispatch) {
            // Apply replacements right-to-left so earlier positions remain valid.
            const ordered = [...plugin.results].sort((a, b) => b.from - a.from);
            for (const m of ordered) {
              tr.insertText(replacement, m.from, m.to);
            }
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchPluginState>({
        key: searchPluginKey,
        state: {
          init: () => EMPTY_STATE,
          apply(tr, prev, _oldState, newState): SearchPluginState {
            const meta = tr.getMeta(searchPluginKey) as SearchMeta | undefined;

            if (meta?.type === 'clear') {
              return EMPTY_STATE;
            }

            if (meta?.type === 'setQuery') {
              const results = findMatches(newState, meta.query, meta.caseSensitive);
              const currentIndex = pickIndexNearSelection(newState, results);
              return {
                query: meta.query,
                caseSensitive: meta.caseSensitive,
                results,
                currentIndex,
              };
            }

            if (meta?.type === 'setCurrent') {
              if (prev.results.length === 0) return prev;
              const clamped = Math.max(0, Math.min(prev.results.length - 1, meta.index));
              return { ...prev, currentIndex: clamped };
            }

            if (tr.docChanged && prev.query) {
              const results = findMatches(newState, prev.query, prev.caseSensitive);
              if (results.length === 0) {
                return { ...prev, results, currentIndex: -1 };
              }
              // Try to keep the cursor near the same logical match by mapping the old
              // current `from` forward; otherwise fall back to nearest after the selection.
              let nextIndex = -1;
              const oldCurrent = prev.results[prev.currentIndex];
              if (oldCurrent) {
                const mappedFrom = tr.mapping.map(oldCurrent.from);
                nextIndex = results.findIndex((m) => m.from >= mappedFrom);
                if (nextIndex === -1) nextIndex = 0;
              } else {
                nextIndex = pickIndexNearSelection(newState, results);
              }
              return { ...prev, results, currentIndex: nextIndex };
            }

            return prev;
          },
        },
        props: {
          decorations(state) {
            const plugin = searchPluginKey.getState(state);
            if (!plugin) return DecorationSet.empty;
            return buildDecorations(state, plugin);
          },
        },
      }),
    ];
  },
});
