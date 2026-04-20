import type { CommandProps } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type TabAutocompleteMeta =
  | { type: 'set'; text: string; anchor: number }
  | { type: 'clear' };

export type TabAutocompletePluginState = {
  ghost: string | null;
  anchor: number | null;
};

export const tabAutocompletePluginKey = new PluginKey<TabAutocompletePluginState>('scribeTabAutocomplete');

export const TabAutocomplete = Extension.create({
  name: 'tabAutocomplete',

  priority: 1000,

  addCommands() {
    return {
      setTabAutocompleteGhost:
        (text: string | null, anchor: number | null) =>
        ({ tr, dispatch }: CommandProps) => {
          if (!dispatch) return false;
          if (text != null && text !== '' && anchor != null) {
            const meta: TabAutocompleteMeta = { type: 'set', text, anchor };
            dispatch(tr.setMeta(tabAutocompletePluginKey, meta));
          } else {
            const meta: TabAutocompleteMeta = { type: 'clear' };
            dispatch(tr.setMeta(tabAutocompletePluginKey, meta));
          }
          return true;
        },

      insertTabAutocomplete:
        () =>
        ({ state, dispatch }: CommandProps) => {
          const st = tabAutocompletePluginKey.getState(state);
          if (!st?.ghost || st.anchor == null) return false;
          if (state.selection.from !== st.anchor || !state.selection.empty) return false;
          if (dispatch) {
            const tr = state.tr.insertText(st.ghost, st.anchor);
            const clearMeta: TabAutocompleteMeta = { type: 'clear' };
            tr.setMeta(tabAutocompletePluginKey, clearMeta);
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.insertTabAutocomplete(),
      Escape: () => this.editor.commands.setTabAutocompleteGhost(null, null),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<TabAutocompletePluginState>({
        key: tabAutocompletePluginKey,
        state: {
          init: () => ({ ghost: null, anchor: null }),
          apply(tr, pluginState): TabAutocompletePluginState {
            const meta = tr.getMeta(tabAutocompletePluginKey) as TabAutocompleteMeta | undefined;
            if (meta?.type === 'clear') {
              return { ghost: null, anchor: null };
            }
            if (meta?.type === 'set') {
              return { ghost: meta.text, anchor: meta.anchor };
            }
            if (tr.docChanged || tr.selectionSet) {
              return { ghost: null, anchor: null };
            }
            return pluginState;
          },
        },
        props: {
          decorations(state) {
            const st = tabAutocompletePluginKey.getState(state);
            if (!st?.ghost || st.anchor == null) return DecorationSet.empty;
            if (state.selection.from !== st.anchor || !state.selection.empty) return DecorationSet.empty;

            const ghostText = st.ghost;
            const deco = Decoration.widget(
              st.anchor,
              () => {
                const wrapper = document.createElement('span');
                wrapper.className = 'scribe-tab-autocomplete';
                wrapper.setAttribute('aria-hidden', 'true');

                const ghost = document.createElement('span');
                ghost.className = 'scribe-tab-autocomplete-ghost';
                ghost.textContent = ghostText;
                wrapper.appendChild(ghost);

                const hint = document.createElement('span');
                hint.className = 'scribe-tab-autocomplete-hint';
                hint.innerHTML = '<kbd>Tab</kbd> to accept';
                wrapper.appendChild(hint);

                return wrapper;
              },
              { side: 1, key: 'scribe-tab-autocomplete-ghost' },
            );
            return DecorationSet.create(state.doc, [deco]);
          },
        },
      }),
    ];
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tabAutocomplete: {
      setTabAutocompleteGhost: (text: string | null, anchor: number | null) => ReturnType;
      insertTabAutocomplete: () => ReturnType;
    };
  }
}
