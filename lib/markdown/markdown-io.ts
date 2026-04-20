import { marked } from 'marked';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

import type { OpenDocumentResult } from '@/src/scribe-ipc-types';

marked.setOptions({ gfm: true, breaks: false });

/**
 * Rehydrate GitHub admonitions (`> [!INFO]`) back into our `<div data-type="callout">` blocks.
 * Runs once on module init; marked uses the walker hooks to transform matching blockquotes.
 */
type MarkedToken = {
  type?: string;
  raw?: string;
  tokens?: MarkedToken[];
  text?: string;
} & Record<string, unknown>;

type CalloutVariant = 'info' | 'warning' | 'note';
function parseCalloutHeader(text: string | undefined): CalloutVariant | null {
  if (!text) return null;
  const match = /^\[!(INFO|WARNING|NOTE|TIP|CAUTION|IMPORTANT)\]\s*/i.exec(text.trim());
  if (!match) return null;
  const key = match[1].toLowerCase();
  if (key === 'warning' || key === 'caution') return 'warning';
  if (key === 'note' || key === 'important' || key === 'tip') return 'note';
  return 'info';
}

marked.use({
  walkTokens(token) {
    const t = token as MarkedToken;
    if (t.type !== 'blockquote') return;
    const children = t.tokens ?? [];
    const firstPara = children[0];
    const firstParaTokens =
      firstPara && (firstPara as MarkedToken).type === 'paragraph'
        ? ((firstPara as MarkedToken).tokens ?? [])
        : [];
    const headerText = firstParaTokens[0] as MarkedToken | undefined;
    if (!headerText || headerText.type !== 'text') return;
    const variant = parseCalloutHeader((headerText.text ?? ''));
    if (!variant) return;

    // Drop the header line from the first paragraph; if the paragraph becomes empty, drop it.
    const cleanedFirstTokens = firstParaTokens.slice(1);
    // Strip a possible leading <br> (often present after the marker on a dedicated line).
    if (cleanedFirstTokens.length && (cleanedFirstTokens[0] as MarkedToken).type === 'br') {
      cleanedFirstTokens.shift();
    }
    const remainder = cleanedFirstTokens.length
      ? [{ ...(firstPara as MarkedToken), tokens: cleanedFirstTokens }]
      : [];
    const newChildren = [...remainder, ...children.slice(1)];
    const innerHtml = marked.parser(
      newChildren as unknown as Parameters<typeof marked.parser>[0],
      { gfm: true },
    );
    // Replace this blockquote with a raw HTML block that our Callout extension re-parses.
    t.type = 'html';
    t.raw = '';
    t.pre = false;
    (t as MarkedToken).text =
      `<div data-type="callout" data-variant="${variant}">` +
      `<span class="callout-icon" contenteditable="false"></span>` +
      `<div class="callout-body">${innerHtml}</div>` +
      `</div>`;
  },
});

let turndown: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (!turndown) {
    const td = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      fence: '```',
      emDelimiter: '*',
    });
    td.use(gfm);

    // Preserve custom scribe blocks as raw HTML so Tiptap's parseHTML can rehydrate them on load.
    td.addRule('scribeCallout', {
      filter: (node) =>
        node.nodeName === 'DIV' &&
        (node as HTMLElement).getAttribute('data-type') === 'callout',
      replacement: (_, node, options) => {
        const el = node as HTMLElement;
        const variant = (el.getAttribute('data-variant') ?? 'info').toLowerCase();
        // Convert inner content (which is nested block markdown) separately to keep fidelity.
        const innerMd = new TurndownService({
          headingStyle: options.headingStyle,
          codeBlockStyle: options.codeBlockStyle,
          bulletListMarker: options.bulletListMarker,
        })
          .use(gfm)
          .turndown(el.querySelector('.callout-body')?.innerHTML ?? el.innerHTML);
        const bodyLines = innerMd.split('\n').map((line) => (line ? `> ${line}` : '>'));
        return `\n\n> [!${variant.toUpperCase()}]\n${bodyLines.join('\n')}\n\n`;
      },
    });

    // Preserve task list checkboxes even when GFM plugin misses specific markup.
    td.addRule('scribeTaskItem', {
      filter: (node) =>
        node.nodeName === 'LI' &&
        (node as HTMLElement).getAttribute('data-type') === 'taskItem',
      replacement: (_, node, options) => {
        const el = node as HTMLElement;
        const checked = el.getAttribute('data-checked') === 'true';
        const inner = new TurndownService({
          headingStyle: options.headingStyle,
          codeBlockStyle: options.codeBlockStyle,
          bulletListMarker: options.bulletListMarker,
        })
          .use(gfm)
          .turndown(el.innerHTML)
          .replace(/^\s*[-*]\s+/, '')
          .trim();
        return `- [${checked ? 'x' : ' '}] ${inner}\n`;
      },
    });

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
