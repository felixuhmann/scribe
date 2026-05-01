/**
 * Mutable Markdown working buffer the editing agent reads from and edits via
 * `strReplace` / `appendDocument`. One instance per chat run; the IPC handler
 * builds it from the live editor HTML at run start and flushes the final
 * Markdown back to the renderer when the agent finishes.
 *
 * Design notes:
 * - Line-oriented: matches what coding agents are trained on, makes
 *   `readDocument` slices and search results easy to communicate.
 * - `strReplace` requires a unique match. Ambiguous matches force the model
 *   to add surrounding context — same contract as Cursor / Claude Code's
 *   `str_replace_based_edit_tool`.
 * - All errors thrown by edit methods are typed (`StrReplaceError`) so the
 *   tool layer can hand a structured failure back to the model and let it
 *   re-read and retry.
 */

export type DocumentOutlineEntry = {
  /** Stable id derived from line index (`h{lineNumber}`) — useful in chat UI cards. */
  headingId: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  /** 1-based line number where the heading itself sits. */
  startLine: number;
  /**
   * 1-based line number of the last line that belongs to this section
   * (i.e. the line before the next heading of equal-or-higher level, or EOF).
   */
  endLine: number;
};

export type DocumentStats = {
  lineCount: number;
  wordCount: number;
  charCount: number;
  outline: DocumentOutlineEntry[];
};

export type ReadResult = {
  /** 1-based start line of the slice (clamped to the buffer). */
  startLine: number;
  /** 1-based end line of the slice (inclusive, clamped). */
  endLine: number;
  /** Total lines in the buffer at read time — model can plan further reads. */
  totalLines: number;
  /** `lineNumber: text` formatted slice. */
  content: string;
};

export type SearchHit = {
  lineNumber: number;
  /** 1-based column where the match starts on its line. */
  column: number;
  /** 1-based index across the whole document (1 = first occurrence). */
  occurrenceIndex: number;
  /** Short snippet around the match (about 80 chars, with `…` markers when trimmed). */
  preview: string;
};

export type SearchResult = {
  query: string;
  /** Total number of occurrences of `query` across the entire document. */
  totalMatches: number;
  /** Distinct lines that contain at least one match. */
  matchingLines: number;
  /** One entry per occurrence (not per line), capped at `maxResults`. */
  hits: SearchHit[];
  /** True when more occurrences exist than `hits.length`. */
  truncated: boolean;
};

export type StrReplaceResult = {
  /** Total occurrences replaced (always 1 in the strict path). */
  replaced: 1;
  /** 1-based line number where the replacement landed (start of new content). */
  startLine: number;
  /** 1-based last line of the replacement after applying. */
  endLine: number;
  /** A small preview of the buffer around the edit so the model can verify. */
  contextPreview: string;
};

export type AppendResult = {
  /** 1-based line number of the first appended line. */
  startLine: number;
  endLine: number;
  totalLinesAfter: number;
};

export type EditLogEntry =
  | {
      kind: 'strReplace';
      /** ~80-char summary of the change for chat-side rendering. */
      summary: string;
      startLine: number;
      endLine: number;
      timestamp: number;
    }
  | {
      kind: 'appendDocument';
      summary: string;
      startLine: number;
      endLine: number;
      timestamp: number;
    };

export type StrReplaceErrorReason = 'not-found' | 'ambiguous' | 'empty-old-text' | 'no-op';

export class StrReplaceError extends Error {
  readonly reason: StrReplaceErrorReason;
  readonly matchCount: number;

  constructor(reason: StrReplaceErrorReason, matchCount: number, message: string) {
    super(message);
    this.name = 'StrReplaceError';
    this.reason = reason;
    this.matchCount = matchCount;
  }
}

const DEFAULT_READ_LIMIT = 100;
const MAX_READ_LIMIT = 600;
const DEFAULT_SEARCH_LIMIT = 30;
const MAX_SEARCH_LIMIT = 100;
const CONTEXT_PREVIEW_LINES = 3;

/**
 * Markdown buffer with read/edit primitives. Internally stored as a single
 * string: keeps `strReplace` semantics simple (a single `indexOf`/`split`
 * pass) and avoids ambiguity around line endings inside multi-line `oldText`.
 *
 * Line-based views (read, search, outline) compute on demand from `content`.
 * For typical document sizes (<100k chars) this is plenty fast; if it ever
 * matters we can cache the line array.
 */
export class DocumentBuffer {
  private content: string;
  private readonly initialContent: string;
  private readonly editLog: EditLogEntry[] = [];

  constructor(initialMarkdown: string) {
    /** Normalize line endings up front so search/replace is consistent. */
    const normalized = initialMarkdown.replace(/\r\n?/g, '\n');
    this.content = normalized;
    this.initialContent = normalized;
  }

  // -- Inspection --------------------------------------------------------

  getMarkdown(): string {
    return this.content;
  }

  isDirty(): boolean {
    return this.content !== this.initialContent;
  }

  getEditLog(): readonly EditLogEntry[] {
    return this.editLog;
  }

  getStats(): DocumentStats {
    const lines = this.splitLines();
    const wordCount = countWords(this.content);
    return {
      lineCount: lines.length,
      wordCount,
      charCount: this.content.length,
      outline: buildOutline(lines),
    };
  }

  // -- Read --------------------------------------------------------------

  /**
   * Returns a 1-indexed, line-numbered slice of the buffer. `offset` is the
   * 1-based starting line; pass `offset: 1` (or omit) for the top of the doc.
   * `limit` defaults to 100 lines and is capped at 600 to keep tool outputs
   * bounded.
   */
  read(opts?: { offset?: number; limit?: number }): ReadResult {
    const lines = this.splitLines();
    const totalLines = lines.length;
    const requestedOffset = opts?.offset ?? 1;
    const limit = clampPositive(opts?.limit ?? DEFAULT_READ_LIMIT, 1, MAX_READ_LIMIT);
    const startLine = clampPositive(requestedOffset, 1, Math.max(1, totalLines));
    const endLine = Math.min(totalLines, startLine + limit - 1);

    const slice = lines.slice(startLine - 1, endLine);
    const width = String(endLine).length;
    const content = slice
      .map((line, i) => `${String(startLine + i).padStart(width, ' ')}: ${line}`)
      .join('\n');

    return {
      startLine,
      endLine: Math.max(startLine, endLine),
      totalLines,
      content,
    };
  }

  // -- Search ------------------------------------------------------------

  /**
   * Find every occurrence of `query` across the document. Counts each
   * appearance independently — a line containing "Trump" three times
   * contributes three hits, not one. Hits are returned in document order;
   * `totalMatches` reflects the true occurrence count even when `hits` is
   * truncated by `maxResults`.
   *
   * Regex mode matches per line (anchors apply per line; cross-line matches
   * are not supported).
   */
  search(opts: {
    query: string;
    regex?: boolean;
    caseInsensitive?: boolean;
    maxResults?: number;
  }): SearchResult {
    const query = opts.query;
    const empty: SearchResult = {
      query,
      totalMatches: 0,
      matchingLines: 0,
      hits: [],
      truncated: false,
    };
    if (!query) return empty;

    const max = clampPositive(opts.maxResults ?? DEFAULT_SEARCH_LIMIT, 1, MAX_SEARCH_LIMIT);
    const lines = this.splitLines();

    /**
     * Per-line iterator returning [start, end] match ranges in CANONICAL
     * (formatting-stripped) coordinates. We then map them back to original
     * markdown positions for reporting — so callers see markdown-form
     * previews / columns, but the count matches the rendered text.
     */
    let scanCanonical: (canonical: string) => Array<[number, number]>;

    if (opts.regex) {
      let re: RegExp;
      try {
        re = new RegExp(query, opts.caseInsensitive ? 'gi' : 'g');
      } catch {
        return empty;
      }
      scanCanonical = (canonical) => {
        re.lastIndex = 0;
        const ranges: Array<[number, number]> = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(canonical)) !== null) {
          /** Defensive: zero-width matches would loop forever — advance manually. */
          if (m.index === re.lastIndex) re.lastIndex += 1;
          ranges.push([m.index, m.index + m[0].length]);
        }
        return ranges;
      };
    } else {
      const needle = opts.caseInsensitive ? query.toLowerCase() : query;
      const cmp = (s: string) => (opts.caseInsensitive ? s.toLowerCase() : s);
      scanCanonical = (canonical) => {
        const haystack = cmp(canonical);
        const ranges: Array<[number, number]> = [];
        let from = 0;
        for (;;) {
          const idx = haystack.indexOf(needle, from);
          if (idx === -1) return ranges;
          ranges.push([idx, idx + needle.length]);
          from = idx + needle.length;
        }
      };
    }

    let totalMatches = 0;
    let matchingLines = 0;
    const hits: SearchHit[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const { canonical, mdIndex } = canonicalizeMarkdownLine(line);
      const ranges = scanCanonical(canonical);
      if (ranges.length === 0) continue;
      matchingLines += 1;
      for (const [canonStart, canonEnd] of ranges) {
        totalMatches += 1;
        if (hits.length < max) {
          /**
           * Map canonical positions back to the original markdown line.
           * `mdIndex[k]` is the markdown column of the k-th canonical char.
           * For the end we use the index of the last matched char + 1, so
           * the highlighted region covers everything up to (but not
           * including) the next character.
           */
          const mdStart = mdIndex[canonStart] ?? canonStart;
          const lastMatchedCanon = Math.max(canonStart, canonEnd - 1);
          const mdEnd = (mdIndex[lastMatchedCanon] ?? mdStart) + 1;
          hits.push({
            lineNumber: i + 1,
            column: mdStart + 1,
            occurrenceIndex: totalMatches,
            preview: snippetAround(line, mdStart, Math.min(line.length, mdEnd)),
          });
        }
      }
    }

    return {
      query,
      totalMatches,
      matchingLines,
      hits,
      truncated: totalMatches > hits.length,
    };
  }

  // -- Edit --------------------------------------------------------------

  strReplace(oldText: string, newText: string): StrReplaceResult {
    if (oldText.length === 0) {
      throw new StrReplaceError('empty-old-text', 0, '`oldText` must be a non-empty string.');
    }
    if (oldText === newText) {
      throw new StrReplaceError('no-op', 1, '`oldText` and `newText` are identical — no edit to apply.');
    }
    const normalizedOld = oldText.replace(/\r\n?/g, '\n');
    const normalizedNew = newText.replace(/\r\n?/g, '\n');

    const matchCount = countOccurrences(this.content, normalizedOld);
    if (matchCount === 0) {
      throw new StrReplaceError(
        'not-found',
        0,
        '`oldText` was not found in the document. Re-read the relevant section and try again with an exact match.',
      );
    }
    if (matchCount > 1) {
      throw new StrReplaceError(
        'ambiguous',
        matchCount,
        `\`oldText\` matched ${matchCount} times. Add surrounding context so the match is unique.`,
      );
    }

    const matchIndex = this.content.indexOf(normalizedOld);
    const before = this.content.slice(0, matchIndex);
    const after = this.content.slice(matchIndex + normalizedOld.length);
    const startLine = before.split('\n').length;
    const newLineCount = normalizedNew === '' ? 1 : normalizedNew.split('\n').length;
    const endLine = startLine + Math.max(0, newLineCount - 1);

    this.content = before + normalizedNew + after;

    const contextPreview = this.previewAround(startLine, endLine);
    const summary = summarizeEdit(normalizedOld, normalizedNew);
    this.editLog.push({
      kind: 'strReplace',
      summary,
      startLine,
      endLine,
      timestamp: Date.now(),
    });

    return {
      replaced: 1,
      startLine,
      endLine,
      contextPreview,
    };
  }

  appendDocument(text: string): AppendResult {
    const normalized = text.replace(/\r\n?/g, '\n');
    if (normalized.length === 0) {
      const totalLines = this.splitLines().length;
      return { startLine: totalLines, endLine: totalLines, totalLinesAfter: totalLines };
    }

    /** Ensure exactly one blank line separator between existing content and the new tail. */
    const needsNewline = this.content.length > 0 && !this.content.endsWith('\n');
    const separator = needsNewline ? '\n' : '';
    const linesBefore = this.splitLines().length;
    /** New chunk starts on the next line after current content. */
    const startLine = this.content.length === 0 ? 1 : linesBefore + (this.content.endsWith('\n') ? 1 : 1);

    this.content = this.content + separator + normalized;
    const linesAfter = this.splitLines().length;
    const endLine = linesAfter;

    const summary = `Appended ${normalized.split('\n').length} line${
      normalized.split('\n').length === 1 ? '' : 's'
    }`;
    this.editLog.push({
      kind: 'appendDocument',
      summary,
      startLine,
      endLine,
      timestamp: Date.now(),
    });

    return { startLine, endLine, totalLinesAfter: linesAfter };
  }

  // -- Internals ---------------------------------------------------------

  private splitLines(): string[] {
    /**
     * `''.split('\n')` returns `['']` — that's fine for our purposes (an empty
     * doc reports as 1 line, mirroring most editors). For non-empty content
     * with a trailing newline we drop the empty tail so line counts feel
     * natural to the model (matches `wc -l`-ish intuition).
     */
    if (this.content.length === 0) return [''];
    const parts = this.content.split('\n');
    if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
    return parts;
  }

  private previewAround(startLine: number, endLine: number): string {
    const lines = this.splitLines();
    const from = Math.max(1, startLine - CONTEXT_PREVIEW_LINES);
    const to = Math.min(lines.length, endLine + CONTEXT_PREVIEW_LINES);
    const slice = lines.slice(from - 1, to);
    const width = String(to).length;
    return slice
      .map((line, i) => `${String(from + i).padStart(width, ' ')}: ${line}`)
      .join('\n');
  }
}

// -- Helpers -----------------------------------------------------------

function clampPositive(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return count;
    count += 1;
    /** Advance by 1, not needle.length, so we count overlapping matches too — matters for `ambiguous` detection on patterns that overlap. */
    from = idx + 1;
  }
}

function countWords(text: string): number {
  if (!text) return 0;
  /** Strip code fences before counting so very long fenced blocks don't dominate the budget. */
  const stripped = text.replace(/```[\s\S]*?```/g, ' ');
  return stripped.split(/\s+/).filter(Boolean).length;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE_RE = /^```/;

function buildOutline(lines: string[]): DocumentOutlineEntry[] {
  type Tmp = { headingId: string; level: 1 | 2 | 3 | 4 | 5 | 6; text: string; startLine: number };
  const raw: Tmp[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = HEADING_RE.exec(line);
    if (!match) continue;
    const level = match[1].length as 1 | 2 | 3 | 4 | 5 | 6;
    const text = match[2].trim();
    const startLine = i + 1;
    raw.push({ headingId: `h${startLine}`, level, text, startLine });
  }
  /** Compute endLine by looking ahead to the next heading of equal-or-higher level. */
  const out: DocumentOutlineEntry[] = [];
  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i];
    let endLine = lines.length;
    for (let j = i + 1; j < raw.length; j++) {
      if (raw[j].level <= cur.level) {
        endLine = raw[j].startLine - 1;
        break;
      }
    }
    out.push({ ...cur, endLine });
  }
  return out;
}

const SNIPPET_PAD = 40;

/**
 * Strip Markdown inline formatting markers (`**`, `*`, `_`, `__`, `~~`,
 * `` ` ``) and unescape `\X` so that `*T*rump`, `**Trump**`, `\*Trump\*`,
 * etc. all canonicalize to plain `Trump`. Returns the cleaned string plus
 * an index map: `mdIndex[k]` is the original-line column of the k-th
 * cleaned character. Used by `search` so a substring lookup matches the
 * rendered text the user sees in the editor — not the raw markdown source.
 *
 * Heuristic: only emphasis markers, code-span backticks, and backslash
 * escapes are recognized. Doesn't try to parse links/images/HTML — those
 * keep their text intact in markdown source so plain `indexOf` already
 * finds matches inside them.
 */
function canonicalizeMarkdownLine(line: string): { canonical: string; mdIndex: number[] } {
  const out: string[] = [];
  const mdIndex: number[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === '*' || c === '_' || c === '~' || c === '`') {
      i += 1;
      continue;
    }
    if (c === '\\' && i + 1 < line.length) {
      /** Markdown escape: keep the escaped char, drop the backslash. */
      i += 1;
      out.push(line[i]);
      mdIndex.push(i);
      i += 1;
      continue;
    }
    out.push(c);
    mdIndex.push(i);
    i += 1;
  }
  return { canonical: out.join(''), mdIndex };
}

/**
 * Return ~80 chars of context around a match range on a single line, with
 * `…` markers when trimmed. Keeps tool outputs compact when many hits live
 * inside a single 800-char paragraph.
 */
function snippetAround(line: string, matchStart: number, matchEnd: number): string {
  const from = Math.max(0, matchStart - SNIPPET_PAD);
  const to = Math.min(line.length, matchEnd + SNIPPET_PAD);
  const head = from > 0 ? '…' : '';
  const tail = to < line.length ? '…' : '';
  return `${head}${line.slice(from, to)}${tail}`;
}

function summarizeEdit(oldText: string, newText: string): string {
  const firstOldLine = oldText.split('\n')[0].trim();
  const firstNewLine = newText.split('\n')[0].trim();
  const oldPreview = firstOldLine.length > 40 ? `${firstOldLine.slice(0, 37)}…` : firstOldLine;
  const newPreview = firstNewLine.length > 40 ? `${firstNewLine.slice(0, 37)}…` : firstNewLine;
  if (newText.length === 0) return `Removed: "${oldPreview}"`;
  return `"${oldPreview}" → "${newPreview}"`;
}
