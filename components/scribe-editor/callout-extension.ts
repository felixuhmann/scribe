import { mergeAttributes, Node } from '@tiptap/core';

export type CalloutVariant = 'info' | 'warning' | 'note';

const VARIANT_ICONS: Record<CalloutVariant, string> = {
  info: '💡',
  warning: '⚠️',
  note: '📝',
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (variant?: CalloutVariant) => ReturnType;
      toggleCallout: (variant?: CalloutVariant) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

/**
 * Callout block: an info/warning/note box containing one or more paragraphs.
 * Rendered as <div data-type="callout" data-variant="..."> with an icon span and a content wrapper.
 */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: 'info' as CalloutVariant,
        parseHTML: (el) => (el.getAttribute('data-variant') as CalloutVariant) ?? 'info',
        renderHTML: (attrs) => ({ 'data-variant': attrs.variant }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const variant: CalloutVariant = (HTMLAttributes['data-variant'] as CalloutVariant) ?? 'info';
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }),
      ['span', { class: 'callout-icon', contenteditable: 'false' }, VARIANT_ICONS[variant]],
      ['div', { class: 'callout-body' }, 0],
    ];
  },

  addCommands() {
    return {
      setCallout:
        (variant = 'info') =>
        ({ commands }) =>
          commands.wrapIn(this.name, { variant }),
      toggleCallout:
        (variant = 'info') =>
        ({ commands }) =>
          commands.toggleWrap(this.name, { variant }),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});
