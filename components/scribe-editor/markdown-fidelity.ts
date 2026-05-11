/**
 * Detects editor features in HTML that typical Markdown export cannot represent faithfully.
 * Used before saving or exporting to Markdown.
 */
export function getMarkdownFidelityWarnings(html: string): string[] {
  if (typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const warnings: string[] = [];

  if (doc.querySelector('u')) {
    warnings.push('Underline');
  }
  if (doc.querySelector('sub')) {
    warnings.push('Subscript');
  }
  if (doc.querySelector('sup')) {
    warnings.push('Superscript');
  }

  // Images with base64 data URIs are huge; inline markdown can't reference them without a file.
  if (doc.querySelector('img[src^="data:"]')) {
    warnings.push('Embedded images (data URIs)');
  }

  // Tables: check structural features that GFM cannot represent.
  const tableWarnings = collectTableWarnings(doc);
  warnings.push(...tableWarnings.filter((w) => !warnings.includes(w)));

  // Non-table text alignment is reported separately so users can distinguish.
  doc.querySelectorAll('[style]').forEach((el) => {
    const tag = el.tagName.toUpperCase();
    if (tag === 'TH' || tag === 'TD') return; // covered by collectTableWarnings
    const st = el.getAttribute('style') ?? '';
    const m = /text-align:\s*([^;]+)/i.exec(st);
    if (!m) return;
    const v = m[1].trim().toLowerCase();
    if (v !== 'left' && v !== 'start' && v !== '') {
      if (!warnings.includes('Text alignment')) {
        warnings.push('Text alignment');
      }
    }
  });

  return warnings;
}

/**
 * GFM tables are limited:
 *   - column alignment per-column (not per-cell)
 *   - no merged cells (rowspan/colspan > 1)
 *   - no header column (only header row)
 *   - no block content inside cells
 * We surface a warning per distinct issue so users know what will change.
 */
function collectTableWarnings(doc: Document): string[] {
  const warnings: string[] = [];
  const tables = doc.querySelectorAll('table');
  if (tables.length === 0) return warnings;

  let hasMergedCells = false;
  let hasHeaderColumn = false;
  let hasMixedAlignment = false;
  let hasBlockCellContent = false;

  tables.forEach((table) => {
    // Merged cells: any cell with rowspan or colspan > 1.
    table.querySelectorAll('th, td').forEach((cell) => {
      const rowspan = parseInt(cell.getAttribute('rowspan') ?? '1', 10);
      const colspan = parseInt(cell.getAttribute('colspan') ?? '1', 10);
      if (rowspan > 1 || colspan > 1) hasMergedCells = true;

      // Block content inside cells: any non-paragraph block element.
      cell.querySelectorAll('h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre').forEach(() => {
        hasBlockCellContent = true;
      });
    });

    // Header column: any row whose first cell is a `<th>` while the row is not the first row.
    const rows = Array.from(table.querySelectorAll('tr'));
    rows.forEach((row, index) => {
      if (index === 0) return; // first row may legitimately be the header row
      const first = row.firstElementChild;
      if (first && first.tagName.toUpperCase() === 'TH') {
        hasHeaderColumn = true;
      }
    });

    // Mixed cell alignment: per-cell alignment differs within a column.
    const columnAligns: Array<Set<string>> = [];
    rows.forEach((row) => {
      let col = 0;
      Array.from(row.children).forEach((cell) => {
        const colspan = parseInt(cell.getAttribute('colspan') ?? '1', 10);
        const style = (cell.getAttribute('style') ?? '').toLowerCase();
        const m = /text-align:\s*([^;]+)/.exec(style);
        const align = m ? m[1].trim() : 'left';
        if (!columnAligns[col]) columnAligns[col] = new Set();
        columnAligns[col].add(align);
        col += colspan;
      });
    });
    if (columnAligns.some((set) => set && set.size > 1)) hasMixedAlignment = true;
  });

  if (hasMergedCells) warnings.push('Merged table cells');
  if (hasHeaderColumn) warnings.push('Header column (first column)');
  if (hasMixedAlignment) warnings.push('Per-cell table alignment');
  if (hasBlockCellContent) warnings.push('Lists or headings inside table cells');

  return warnings;
}

export function formatMarkdownFidelityPrompt(warnings: string[]): string {
  const list = warnings.join(', ');
  return `This document uses formatting that Markdown does not represent well (${list}). Some of it may be lost or simplified when you save. Continue?`;
}
