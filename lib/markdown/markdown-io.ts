import { marked } from 'marked';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

import type { OpenDocumentResult } from '@/src/scribe-ipc-types';

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

/**
 * Convert a successful `openDocument`/`openDocumentAtPath` result into the
 * HTML fragment Tiptap should load. Markdown payloads are parsed; HTML
 * payloads pass through unchanged. Callers should check `result.ok` first.
 */
export function openDocumentResultToEditorHtml(
  result: Extract<OpenDocumentResult, { ok: true }>,
): string {
  return result.format === 'markdown' ? markdownToEditorHtml(result.text) : result.text;
}

/** Same idea as `openDocumentResultToEditorHtml`, but for a local file picker. */
export function localFileToEditorHtml(fileName: string, text: string): string {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown')
    ? markdownToEditorHtml(text)
    : text;
}
