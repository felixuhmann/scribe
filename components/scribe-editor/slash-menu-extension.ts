import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';

export type SlashMenuOptions = {
  suggestion: Omit<SuggestionOptions, 'editor'>;
};

export const SlashMenuPluginKey = new PluginKey('scribeSlashMenu');

/**
 * Bridges `/` suggestions to a React renderer. The renderer is supplied via `suggestion.render`
 * and is expected to show a floating menu and call `command` when the user picks an item.
 */
export const SlashMenu = Extension.create<SlashMenuOptions>({
  name: 'scribeSlashMenu',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        command: ({ editor, range, props }) => {
          const run = (props as { run?: (args: { editor: typeof editor; range: typeof range }) => void }).run;
          if (typeof run === 'function') run({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: SlashMenuPluginKey,
        ...this.options.suggestion,
      }),
    ];
  },
});
