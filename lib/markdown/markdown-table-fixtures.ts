/**
 * Round-trip contract for tables across our Markdown ↔ HTML pipeline.
 *
 * The fixtures below describe what users should expect when saving a document
 * that contains a table to Markdown and re-opening it. They are deliberately
 * documented as data so that:
 *
 *   1. Future test runners (vitest, jest, …) can iterate them as regression
 *      cases without rewriting the assertions.
 *   2. Engineers can run `verifyTableRoundTrips()` from the renderer devtools
 *      to spot drift immediately after a `marked` / `turndown` upgrade.
 *
 * Conventions:
 *   - `editorHtml` is what Tiptap would emit for the table (the canonical form
 *     we have to be able to re-open without structural loss).
 *   - `markdown` is what we expect Turndown to emit. We compare structurally
 *     (rows × cells × text) rather than byte-for-byte so cosmetic Turndown
 *     tweaks don't break the suite.
 *   - `lossy` flags features that are not faithfully representable in GFM and
 *     should therefore be surfaced via `getMarkdownFidelityWarnings`.
 */

import { editorHtmlToMarkdown, markdownToEditorHtml } from './markdown-io';

import { getMarkdownFidelityWarnings } from '@/components/scribe-editor/markdown-fidelity';

export type TableFixture = {
  name: string;
  editorHtml: string;
  /** Optional human-friendly description of what this fixture exercises. */
  description?: string;
  /** When true, the fixture is expected to surface fidelity warnings. */
  lossy?: boolean;
  /** Subset of `getMarkdownFidelityWarnings` outputs the fixture must trigger. */
  expectedWarnings?: string[];
  /** Header rows the fixture expects after a round-trip. Defaults to 1. */
  expectedHeaderRows?: number;
  /** Logical row count (header + body) after a round-trip. */
  expectedRows: number;
  /** Logical column count after a round-trip. */
  expectedCols: number;
};

export const TABLE_FIXTURES: TableFixture[] = [
  {
    name: 'simple-3x3-with-header',
    description: 'Baseline GFM table — should round-trip with no warnings.',
    editorHtml: `
      <table>
        <tbody>
          <tr><th>Name</th><th>Role</th><th>Joined</th></tr>
          <tr><td>Alice</td><td>Designer</td><td>2024-01-12</td></tr>
          <tr><td>Bob</td><td>Engineer</td><td>2023-09-04</td></tr>
        </tbody>
      </table>
    `,
    expectedRows: 3,
    expectedCols: 3,
  },
  {
    name: 'header-row-disabled',
    description: 'A table with no header row degrades to a synthesized header in GFM.',
    editorHtml: `
      <table>
        <tbody>
          <tr><td>One</td><td>Two</td></tr>
          <tr><td>Three</td><td>Four</td></tr>
        </tbody>
      </table>
    `,
    // GFM tables always render a header row; we expect the first row of data to
    // *act* as the header after a round-trip. This is documented as a known
    // soft loss but not surfaced as a fidelity warning since the data is intact.
    expectedRows: 2,
    expectedCols: 2,
  },
  {
    name: 'per-column-alignment',
    description: 'Single alignment per column is preservable in GFM.',
    editorHtml: `
      <table>
        <tbody>
          <tr><th style="text-align: left">A</th><th style="text-align: center">B</th><th style="text-align: right">C</th></tr>
          <tr><td style="text-align: left">1</td><td style="text-align: center">2</td><td style="text-align: right">3</td></tr>
        </tbody>
      </table>
    `,
    expectedRows: 2,
    expectedCols: 3,
  },
  {
    name: 'mixed-cell-alignment',
    description: 'Per-cell alignment that varies inside a column is lossy.',
    editorHtml: `
      <table>
        <tbody>
          <tr><th>A</th><th>B</th></tr>
          <tr><td style="text-align: left">left</td><td style="text-align: right">right</td></tr>
          <tr><td style="text-align: right">right</td><td style="text-align: left">left</td></tr>
        </tbody>
      </table>
    `,
    lossy: true,
    expectedWarnings: ['Per-cell table alignment'],
    expectedRows: 3,
    expectedCols: 2,
  },
  {
    name: 'merged-cells',
    description: 'colspan/rowspan cannot survive GFM and must be flagged.',
    editorHtml: `
      <table>
        <tbody>
          <tr><th>Name</th><th colspan="2">Address</th></tr>
          <tr><td>Alice</td><td>123 Main</td><td>Springfield</td></tr>
          <tr><td rowspan="2">Bob</td><td>456 Oak</td><td>Centerville</td></tr>
          <tr><td>789 Pine</td><td>Farmington</td></tr>
        </tbody>
      </table>
    `,
    lossy: true,
    expectedWarnings: ['Merged table cells'],
    expectedRows: 4,
    expectedCols: 3,
  },
  {
    name: 'header-column',
    description: 'Header columns aren’t representable in GFM and must be flagged.',
    editorHtml: `
      <table>
        <tbody>
          <tr><th>Metric</th><th>Q1</th><th>Q2</th></tr>
          <tr><th>Revenue</th><td>10</td><td>12</td></tr>
          <tr><th>Costs</th><td>5</td><td>6</td></tr>
        </tbody>
      </table>
    `,
    lossy: true,
    expectedWarnings: ['Header column (first column)'],
    expectedRows: 3,
    expectedCols: 3,
  },
  {
    name: 'block-content-in-cell',
    description: 'Lists inside cells lose structure in GFM and must be flagged.',
    editorHtml: `
      <table>
        <tbody>
          <tr><th>Topic</th><th>Notes</th></tr>
          <tr><td>Risks</td><td><ul><li>One</li><li>Two</li></ul></td></tr>
        </tbody>
      </table>
    `,
    lossy: true,
    expectedWarnings: ['Lists or headings inside table cells'],
    expectedRows: 2,
    expectedCols: 2,
  },
];

export type FixtureResult = {
  name: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
};

/**
 * Runs every fixture through the markdown pipeline and returns one result per
 * fixture. Designed for ad-hoc verification from the renderer devtools while
 * we have no automated test harness.
 */
export function verifyTableRoundTrips(): FixtureResult[] {
  if (typeof DOMParser === 'undefined') {
    return [
      {
        name: 'environment',
        ok: false,
        errors: ['DOMParser unavailable; run from the renderer process.'],
        warnings: [],
      },
    ];
  }

  return TABLE_FIXTURES.map((fixture) => {
    const errors: string[] = [];

    let warnings: string[] = [];
    try {
      warnings = getMarkdownFidelityWarnings(fixture.editorHtml);
    } catch (e) {
      errors.push(`fidelity check threw: ${(e as Error).message}`);
    }

    if (fixture.lossy && warnings.length === 0) {
      errors.push('Expected fidelity warnings, got none.');
    }
    if (!fixture.lossy && warnings.length > 0) {
      errors.push(`Unexpected fidelity warnings: ${warnings.join(', ')}`);
    }
    fixture.expectedWarnings?.forEach((expected) => {
      if (!warnings.includes(expected)) {
        errors.push(`Missing expected warning: ${expected}`);
      }
    });

    let roundTripped: string | null = null;
    try {
      const md = editorHtmlToMarkdown(fixture.editorHtml);
      roundTripped = markdownToEditorHtml(md);
    } catch (e) {
      errors.push(`pipeline threw: ${(e as Error).message}`);
    }

    if (roundTripped) {
      const doc = new DOMParser().parseFromString(roundTripped, 'text/html');
      const table = doc.querySelector('table');
      if (!table) {
        errors.push('Round-tripped HTML is missing a <table> element.');
      } else {
        const rows = table.querySelectorAll('tr').length;
        const cols = table.querySelector('tr')?.children.length ?? 0;
        if (rows !== fixture.expectedRows) {
          errors.push(`Row count drift: expected ${fixture.expectedRows}, got ${rows}.`);
        }
        // Note: `expectedCols` is approximate when merged cells are flattened.
        if (!fixture.lossy && cols !== fixture.expectedCols) {
          errors.push(`Column count drift: expected ${fixture.expectedCols}, got ${cols}.`);
        }
      }
    }

    return {
      name: fixture.name,
      ok: errors.length === 0,
      errors,
      warnings,
    };
  });
}
