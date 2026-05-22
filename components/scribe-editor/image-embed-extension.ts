import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

const pluginKey = new PluginKey('scribeImageEmbed');

/**
 * Soft cap for a single embedded image's encoded size. Beyond this we warn the
 * user before continuing — base64 inflates by ~33% so this maps to ~6 MB on disk.
 * Embedding very large images bloats the document and slows save/load round-trips.
 */
const LARGE_IMAGE_WARN_BYTES = 8 * 1024 * 1024;

/**
 * Hard cap. We refuse anything bigger so a runaway paste cannot freeze the
 * renderer turning a 100 MB photo into base64.
 */
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

/**
 * Hooks the editor's paste and drop streams so screenshots from the clipboard
 * and image files dragged from the OS become inline `<img src="data:…">` nodes.
 *
 * We deliberately keep everything inline rather than uploading to a server:
 * Scribe documents are single-file artifacts (HTML or Markdown) and embedding
 * preserves that contract — the image travels with the file.
 */
export const ImageEmbed = Extension.create({
  name: 'scribeImageEmbed',
  priority: 260,

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: pluginKey,
        props: {
          handlePaste(_view, event) {
            if (!editor.isEditable) return false;
            const data = event.clipboardData;
            if (!data) return false;

            const files = collectImageFiles(data.items, data.files);
            if (files.length === 0) return false;

            event.preventDefault();
            void embedImageFiles(editor, files, null);
            return true;
          },
          handleDrop(view, event, _slice, moved) {
            // Internal drag-drops (moving a node within the editor) are handled by Tiptap.
            if (moved) return false;
            if (!editor.isEditable) return false;

            const data = event.dataTransfer;
            if (!data) return false;

            const files = collectImageFiles(data.items, data.files);
            if (files.length === 0) return false;

            const pos = posFromDropEvent(view, event);
            event.preventDefault();
            void embedImageFiles(editor, files, pos);
            return true;
          },
        },
      }),
    ];
  },
});

function collectImageFiles(items: DataTransferItemList | null, files: FileList | null): File[] {
  const out: File[] = [];
  if (items) {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.kind !== 'file') continue;
      if (!item.type.startsWith('image/')) continue;
      const file = item.getAsFile();
      if (file) out.push(file);
    }
  }
  if (out.length === 0 && files) {
    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      if (f.type.startsWith('image/')) out.push(f);
    }
  }
  return out;
}

function posFromDropEvent(view: EditorView, event: DragEvent): number | null {
  const coords = { left: event.clientX, top: event.clientY };
  const result = view.posAtCoords(coords);
  return result ? result.pos : null;
}

async function embedImageFiles(
  editor: Editor,
  files: File[],
  insertAt: number | null,
): Promise<void> {
  // Warn once per drop/paste rather than per-file: avoids dialog spam when a user drags 5 photos.
  let warnedAboutLarge = false;

  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) {
      reportImageError(
        `Image “${file.name || 'untitled'}” is too large to embed (${formatBytes(file.size)}). ` +
          `Maximum is ${formatBytes(MAX_IMAGE_BYTES)}.`,
      );
      continue;
    }

    if (!warnedAboutLarge && file.size > LARGE_IMAGE_WARN_BYTES) {
      const proceed = window.confirm(
        `This image is ${formatBytes(file.size)}. Embedding it will significantly increase the document size. Continue?`,
      );
      warnedAboutLarge = true;
      if (!proceed) continue;
    }

    let dataUrl: string;
    try {
      dataUrl = await readAsDataUrl(file);
    } catch (err) {
      reportImageError(
        `Could not read image “${file.name || 'untitled'}”: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    insertAt = insertImage(editor, dataUrl, file.name, insertAt);
  }
}

function insertImage(
  editor: Editor,
  src: string,
  alt: string | undefined,
  insertAt: number | null,
): number | null {
  const chain = editor.chain();
  if (insertAt != null) chain.focus(insertAt);
  else chain.focus();
  chain.setImage({ src, alt: alt || undefined }).run();
  // After insertion, advance the anchor so consecutive files stack instead of overwriting.
  return insertAt != null ? insertAt + 1 : null;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Unknown FileReader error'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Expected a data URL string'));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function reportImageError(message: string): void {
  // No toast system is wired in here; alert is the lowest-friction notifier and
  // matches how the markdown-fidelity flow surfaces user-facing constraints.
  if (typeof window !== 'undefined') window.alert(message);
}
