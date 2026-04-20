import { diffLines, diffWordsWithSpace } from 'diff';

/**
 * Convert HTML into a readable plain-text representation that preserves block
 * structure (paragraphs, headings, lists, blockquotes) so line-level diffs
 * line up with what the user actually reads. Inline markup (bold, italic, links)
 * is stripped — document chat rewrites operate on prose, not markup fidelity.
 */
export function htmlToStructuredText(html: string): string {
  if (typeof document === 'undefined' || !html) {
    // SSR fallback: minimal tag stripper. The real conversion runs in the renderer.
    return html
      .replace(/<\/(p|div|li|h[1-6]|blockquote|pre)>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const container = document.createElement('div');
  container.innerHTML = html;

  const out: string[] = [];
  walkBlock(container, out, { listMarker: null, depth: 0 });
  const text = out.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

type WalkCtx = {
  /** Active list marker when inside a `<ul>` / `<ol>`. */
  listMarker: { kind: 'ul' | 'ol'; index: number } | null;
  /** List nesting level for indentation. */
  depth: number;
};

function getInlineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/\s+/g, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === 'br') return '\n';
  // Inline children — strip tags, keep text.
  let s = '';
  for (const c of el.childNodes) s += getInlineText(c);
  return s;
}

function walkBlock(root: Node, out: string[], ctx: WalkCtx): void {
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? '').trim();
      if (t) out.push(t);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const indent = '  '.repeat(ctx.depth);

    if (/^h[1-6]$/.test(tag)) {
      const level = Number.parseInt(tag[1]!, 10);
      const prefix = '#'.repeat(level);
      const text = getInlineText(el).trim();
      if (text) out.push(`${indent}${prefix} ${text}`);
      out.push('');
      continue;
    }

    if (tag === 'p' || tag === 'div') {
      const text = getInlineText(el).trim();
      if (text) out.push(`${indent}${text}`);
      out.push('');
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      walkBlock(el, out, {
        listMarker: { kind: tag, index: 0 },
        depth: ctx.depth + (ctx.listMarker ? 1 : 0),
      });
      out.push('');
      continue;
    }

    if (tag === 'li') {
      const marker = ctx.listMarker;
      let bullet: string;
      if (marker?.kind === 'ol') {
        marker.index += 1;
        bullet = `${marker.index}.`;
      } else {
        bullet = '•';
      }
      // Split li into inline content + nested block content so nested lists flow after the bullet.
      const inlineChildren: Node[] = [];
      const blockChildren: HTMLElement[] = [];
      for (const c of el.childNodes) {
        if (c.nodeType === Node.ELEMENT_NODE) {
          const t = (c as HTMLElement).tagName.toLowerCase();
          if (t === 'ul' || t === 'ol') {
            blockChildren.push(c as HTMLElement);
            continue;
          }
        }
        inlineChildren.push(c);
      }
      let inline = '';
      for (const c of inlineChildren) inline += getInlineText(c);
      inline = inline.trim();
      if (inline) out.push(`${indent}${bullet} ${inline}`);
      for (const child of blockChildren) {
        walkBlock(child, out, {
          listMarker: { kind: child.tagName.toLowerCase() as 'ul' | 'ol', index: 0 },
          depth: ctx.depth + 1,
        });
      }
      continue;
    }

    if (tag === 'blockquote') {
      const inner: string[] = [];
      walkBlock(el, inner, { listMarker: null, depth: 0 });
      for (const line of inner.join('\n').split('\n')) {
        if (!line.trim()) continue;
        out.push(`${indent}> ${line}`);
      }
      out.push('');
      continue;
    }

    if (tag === 'pre') {
      const text = el.textContent ?? '';
      out.push(`${indent}\`\`\``);
      for (const line of text.split('\n')) out.push(`${indent}${line}`);
      out.push(`${indent}\`\`\``);
      out.push('');
      continue;
    }

    if (tag === 'hr') {
      out.push('---');
      out.push('');
      continue;
    }

    // Generic container: recurse.
    walkBlock(el, out, ctx);
  }
}

export type DiffSegment = {
  kind: 'equal' | 'added' | 'removed';
  text: string;
};

export type DiffRow =
  | {
      kind: 'context';
      /** 0-based position among context rows in the overall before-and-after flow (used for keying). */
      key: string;
      text: string;
    }
  | {
      kind: 'removed';
      key: string;
      text: string;
      /** Inline segments when this removed line is paired with an adjacent added line. */
      segments?: DiffSegment[];
    }
  | {
      kind: 'added';
      key: string;
      text: string;
      segments?: DiffSegment[];
    }
  | {
      kind: 'collapsed';
      key: string;
      count: number;
      /** Hidden context rows that expand on click. */
      rows: DiffRow[];
    };

export type DiffStats = {
  added: number;
  removed: number;
  addedWords: number;
  removedWords: number;
};

type DiffOptions = {
  /** Lines of unchanged context kept adjacent to each change block. Defaults to 2. */
  contextLines?: number;
  /** Collapse runs of unchanged lines larger than this. Defaults to 5. */
  collapseAfter?: number;
};

function splitLines(s: string): string[] {
  if (!s) return [];
  // Preserve empty paragraphs (already normalized to single blank lines by structured text).
  return s.split('\n');
}

function countWords(s: string): number {
  if (!s.trim()) return 0;
  return s.trim().split(/\s+/).length;
}

/**
 * Build a structured unified diff between two HTML snapshots. Produces rows
 * ready to render, with adjacent removed/added pairs augmented by inline
 * word-level segments so the viewer can highlight the exact edit.
 */
export function buildStructuredDiff(
  beforeHtml: string,
  afterHtml: string,
  options: DiffOptions = {},
): { rows: DiffRow[]; stats: DiffStats } {
  const contextLines = options.contextLines ?? 2;
  const collapseAfter = options.collapseAfter ?? 5;

  const beforeText = htmlToStructuredText(beforeHtml);
  const afterText = htmlToStructuredText(afterHtml);

  const parts = diffLines(beforeText, afterText);

  // Flatten parts into per-line rows, preserving neighbor relationships for pairing.
  type RawRow =
    | { kind: 'context'; text: string }
    | { kind: 'added'; text: string }
    | { kind: 'removed'; text: string };
  const raw: RawRow[] = [];
  for (const part of parts) {
    const lines = splitLines(part.value);
    // `diff` puts a trailing newline in most parts; drop a trailing empty line so we don't render phantom rows.
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    const kind: RawRow['kind'] = part.added ? 'added' : part.removed ? 'removed' : 'context';
    for (const line of lines) raw.push({ kind, text: line });
  }

  // Pair adjacent removed-then-added blocks for inline word diffs.
  const paired: Array<
    | { kind: 'context'; text: string }
    | { kind: 'added'; text: string; segments?: DiffSegment[] }
    | { kind: 'removed'; text: string; segments?: DiffSegment[] }
  > = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i].kind === 'removed') {
      // Collect contiguous removed block.
      const removedStart = i;
      while (i < raw.length && raw[i].kind === 'removed') i++;
      const removedBlock = raw.slice(removedStart, i) as Array<{ kind: 'removed'; text: string }>;
      if (i < raw.length && raw[i].kind === 'added') {
        const addedStart = i;
        while (i < raw.length && raw[i].kind === 'added') i++;
        const addedBlock = raw.slice(addedStart, i) as Array<{ kind: 'added'; text: string }>;
        const { removedSegments, addedSegments } = wordDiffBlocks(
          removedBlock.map((r) => r.text).join('\n'),
          addedBlock.map((r) => r.text).join('\n'),
        );
        // Redistribute segments back to per-line rows by walking text with newlines.
        const removedPerLine = splitSegmentsByLine(removedSegments, removedBlock.length);
        const addedPerLine = splitSegmentsByLine(addedSegments, addedBlock.length);
        for (let k = 0; k < removedBlock.length; k++) {
          paired.push({
            kind: 'removed',
            text: removedBlock[k].text,
            segments: removedPerLine[k],
          });
        }
        for (let k = 0; k < addedBlock.length; k++) {
          paired.push({
            kind: 'added',
            text: addedBlock[k].text,
            segments: addedPerLine[k],
          });
        }
      } else {
        for (const r of removedBlock) paired.push({ kind: 'removed', text: r.text });
      }
      continue;
    }
    if (raw[i].kind === 'added') {
      paired.push({ kind: 'added', text: raw[i].text });
      i++;
      continue;
    }
    paired.push({ kind: 'context', text: raw[i].text });
    i++;
  }

  // Collapse long unchanged runs with `contextLines` shown on each side.
  const rows: DiffRow[] = [];
  let keyCounter = 0;
  const nextKey = () => `r${keyCounter++}`;
  let pos = 0;
  while (pos < paired.length) {
    const row = paired[pos];
    if (row.kind !== 'context') {
      if (row.kind === 'removed') {
        rows.push({ kind: 'removed', key: nextKey(), text: row.text, segments: row.segments });
      } else {
        rows.push({ kind: 'added', key: nextKey(), text: row.text, segments: row.segments });
      }
      pos++;
      continue;
    }
    // Walk the unchanged run.
    const runStart = pos;
    while (pos < paired.length && paired[pos].kind === 'context') pos++;
    const runEnd = pos;
    const runLength = runEnd - runStart;

    const isLeadingRun = runStart === 0;
    const isTrailingRun = runEnd === paired.length;
    const headKeep = isLeadingRun ? 0 : contextLines;
    const tailKeep = isTrailingRun ? 0 : contextLines;
    const hiddenStart = runStart + headKeep;
    const hiddenEnd = runEnd - tailKeep;

    if (runLength <= collapseAfter) {
      for (let k = runStart; k < runEnd; k++) {
        rows.push({ kind: 'context', key: nextKey(), text: paired[k].text });
      }
      continue;
    }

    for (let k = runStart; k < hiddenStart; k++) {
      rows.push({ kind: 'context', key: nextKey(), text: paired[k].text });
    }
    const hiddenRows: DiffRow[] = [];
    for (let k = hiddenStart; k < hiddenEnd; k++) {
      hiddenRows.push({ kind: 'context', key: nextKey(), text: paired[k].text });
    }
    if (hiddenRows.length > 0) {
      rows.push({
        kind: 'collapsed',
        key: nextKey(),
        count: hiddenRows.length,
        rows: hiddenRows,
      });
    }
    for (let k = hiddenEnd; k < runEnd; k++) {
      rows.push({ kind: 'context', key: nextKey(), text: paired[k].text });
    }
  }

  const stats: DiffStats = { added: 0, removed: 0, addedWords: 0, removedWords: 0 };
  for (const p of parts) {
    const lines = splitLines(p.value);
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    if (p.added) {
      stats.added += lines.length;
      stats.addedWords += countWords(p.value);
    } else if (p.removed) {
      stats.removed += lines.length;
      stats.removedWords += countWords(p.value);
    }
  }

  return { rows, stats };
}

function wordDiffBlocks(
  beforeText: string,
  afterText: string,
): { removedSegments: DiffSegment[]; addedSegments: DiffSegment[] } {
  const changes = diffWordsWithSpace(beforeText, afterText);
  const removedSegments: DiffSegment[] = [];
  const addedSegments: DiffSegment[] = [];
  for (const c of changes) {
    if (c.added) {
      addedSegments.push({ kind: 'added', text: c.value });
    } else if (c.removed) {
      removedSegments.push({ kind: 'removed', text: c.value });
    } else {
      removedSegments.push({ kind: 'equal', text: c.value });
      addedSegments.push({ kind: 'equal', text: c.value });
    }
  }
  return { removedSegments, addedSegments };
}

/**
 * Given a segment stream that represents an entire multi-line block, return an
 * array of per-line segment arrays. Newlines inside equal segments are what
 * define the line boundaries; added/removed segments are attached to the line
 * they appear on.
 */
function splitSegmentsByLine(segments: DiffSegment[], expectedLines: number): DiffSegment[][] {
  const lines: DiffSegment[][] = [[]];
  for (const seg of segments) {
    const parts = seg.text.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].length > 0) {
        lines[lines.length - 1].push({ kind: seg.kind, text: parts[i] });
      }
      if (i < parts.length - 1) lines.push([]);
    }
  }
  // Pad/trim to exactly match expected line count so callers can zip by index.
  while (lines.length < expectedLines) lines.push([]);
  if (lines.length > expectedLines) lines.length = expectedLines;
  return lines;
}
