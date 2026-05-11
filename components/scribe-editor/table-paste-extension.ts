import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const pluginKey = new PluginKey('scribeTablePaste');

/**
 * Detects clipboard payloads that look like TSV/CSV (multi-line, consistent column counts)
 * and converts them into a real table on paste — but only when the caret is in a regular
 * paragraph. Pasting INTO an existing table preserves Tiptap's default behavior so that
 * users can fill cells from a spreadsheet.
 */
export const TablePaste = Extension.create({
  name: 'scribeTablePaste',
  priority: 250,

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: pluginKey,
        props: {
          handlePaste(view, event) {
            const data = event.clipboardData;
            if (!data) return false;

            // Don't fight Tiptap when pasting into a table — let cells receive content.
            if (editor.isActive('table')) return false;

            // Prefer plain text; if the source is HTML (Sheets/Docs), let the default
            // paste pipeline preserve the richer structure.
            const html = data.getData('text/html');
            if (html && /<table[\s>]/i.test(html)) return false;

            const text = data.getData('text/plain');
            if (!text) return false;

            const parsed = parseDelimited(text);
            if (!parsed) return false;

            const { rows, withHeaderRow } = parsed;
            const success = editor
              .chain()
              .focus()
              .insertTable({ rows: rows.length, cols: rows[0].length, withHeaderRow })
              .run();
            if (!success) return false;

            // After insertTable the caret sits inside the first cell. Find the surrounding
            // table and replace each cell's content with the corresponding parsed text.
            // We rewrite cells back-to-front so earlier positions stay valid as the doc grows.
            const startCellPos = view.state.selection.from;
            const tableEnd = findTableEndAfter(view.state.doc, startCellPos);

            editor.commands.command(({ tr, state }) => {
              const cells = rows.flat();
              const cellPositions: number[] = [];
              state.doc.nodesBetween(startCellPos - 1, tableEnd, (node, pos) => {
                if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
                  cellPositions.push(pos);
                  return false;
                }
                return true;
              });

              for (let i = cellPositions.length - 1; i >= 0; i -= 1) {
                const pos = cellPositions[i];
                const cellNode = state.doc.nodeAt(pos);
                if (!cellNode) continue;
                const text = cells[i] ?? '';
                const para = state.schema.nodes.paragraph?.create(
                  null,
                  text ? state.schema.text(text) : null,
                );
                if (para) {
                  tr.replaceWith(pos + 1, pos + cellNode.nodeSize - 1, para);
                }
              }
              return true;
            });

            event.preventDefault();
            return true;
          },
        },
      }),
    ];
  },
});

function findTableEndAfter(doc: import('@tiptap/pm/model').Node, pos: number): number {
  let end = pos;
  doc.nodesBetween(pos, doc.content.size, (node, nodePos) => {
    if (node.type.name === 'table') {
      end = nodePos + node.nodeSize;
      return false;
    }
    return true;
  });
  return end;
}

type ParsedTable = { rows: string[][]; withHeaderRow: boolean };

/**
 * Heuristically parses TSV or simple CSV. Returns null when the text doesn't look like a table:
 * single line, only one column, or wildly inconsistent column counts.
 */
function parseDelimited(text: string): ParsedTable | null {
  const trimmed = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!trimmed) return null;
  const lines = trimmed.split('\n');
  if (lines.length < 2) return null;

  const tabRows = lines.map((l) => l.split('\t'));
  const tabCols = tabRows[0].length;
  const tabConsistent = tabCols >= 2 && tabRows.every((r) => r.length === tabCols);
  if (tabConsistent) {
    return { rows: tabRows, withHeaderRow: looksLikeHeader(tabRows) };
  }

  const csvRows = lines.map((l) => parseCsvLine(l));
  const csvCols = csvRows[0].length;
  const csvConsistent = csvCols >= 2 && csvRows.every((r) => r.length === csvCols);
  if (!csvConsistent) return null;

  // Avoid eating ordinary prose with commas (e.g. two short comma-separated lines).
  const denseEnough = csvRows.length >= 3 || csvCols >= 3;
  if (!denseEnough) return null;

  return { rows: csvRows, withHeaderRow: looksLikeHeader(csvRows) };
}

function looksLikeHeader(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const header = rows[0];
  const sample = rows[1];
  // If header values are all non-numeric and at least one body cell looks numeric, treat as header.
  const headerHasNumber = header.some((c) => /^-?\d+(\.\d+)?$/.test(c.trim()));
  const bodyHasNumber = sample.some((c) => /^-?\d+(\.\d+)?$/.test(c.trim()));
  return !headerHasNumber && bodyHasNumber;
}

/** Minimal RFC 4180-ish CSV parser supporting quoted fields with embedded commas/quotes. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else if (ch === '"' && cur === '') {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}
