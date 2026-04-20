import type { Editor } from '@tiptap/core';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { createRef, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { filterSlashCommands, SlashMenuView, type SlashMenuHandle, type SlashCommandRunArgs } from './slash-menu';

type SlashItems = ReturnType<typeof filterSlashCommands>;
type SlashProps = SuggestionProps<SlashItems[number], { run: (args: SlashCommandRunArgs) => void }>;

type Renderer = {
  onStart: (props: SlashProps) => void;
  onUpdate: (props: SlashProps) => void;
  onExit: () => void;
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
};

export function buildSlashSuggestion() {
  return {
    items: ({ query }: { query: string; editor: Editor }) => filterSlashCommands(query),
    render: (): Renderer => {
      let container: HTMLDivElement | null = null;
      let root: Root | null = null;
      const handleRef: RefObject<SlashMenuHandle | null> = createRef();
      let latestProps: SlashProps | null = null;

      const resolveRect = (props: SlashProps): DOMRect | null => {
        try {
          const rect = props.clientRect?.();
          if (!rect) return null;
          return rect as DOMRect;
        } catch {
          return null;
        }
      };

      const render = (props: SlashProps) => {
        if (!container) return;
        if (!root) root = createRoot(container);
        root.render(
          <SlashMenuView ref={handleRef} {...props} rect={resolveRect(props)} />,
        );
      };

      return {
        onStart: (props) => {
          latestProps = props;
          container = document.createElement('div');
          container.style.position = 'absolute';
          container.style.top = '0';
          container.style.left = '0';
          container.style.zIndex = '60';
          document.body.appendChild(container);
          render(props);
        },
        onUpdate: (props) => {
          latestProps = props;
          render(props);
        },
        onExit: () => {
          try {
            root?.unmount();
          } catch {
            /* ignore */
          }
          root = null;
          if (container?.parentNode) {
            container.parentNode.removeChild(container);
          }
          container = null;
          latestProps = null;
        },
        onKeyDown: (props) => {
          if (props.event.key === 'Escape') return false;
          if (!handleRef.current) return false;
          const handled = handleRef.current.onKeyDown(props);
          return Boolean(handled && latestProps);
        },
      };
    },
  };
}
