import { marked } from 'marked';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

marked.setOptions({ gfm: true, breaks: false });

let turndown: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (!turndown) {
    const td = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });
    td.use(gfm);
    turndown = td;
  }
  return turndown;
}

/** Markdown source → HTML fragment for Tiptap `setContent`. */
export function markdownToEditorHtml(src: string): string {
  const out = marked.parse(src, { async: false });
  if (typeof out !== 'string') {
    throw new Error('Markdown parsing did not return a string');
  }
  return out;
}

/** Editor HTML → GitHub-flavored Markdown for saving. */
export function editorHtmlToMarkdown(html: string): string {
  return getTurndown().turndown(html);
}
