import type { CommandProps, Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';

export type TableSortDirection = 'asc' | 'desc';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    scribeTable: {
      /** Move the caret to a fresh paragraph immediately after the surrounding table. */
      exitTable: () => ReturnType;
      /** Reset every cell's `colwidth` so the browser distributes columns evenly. */
      distributeTableColumns: () => ReturnType;
      /** Stable sort the surrounding table's data rows by the column under the caret. */
      sortTableByColumn: (direction: TableSortDirection) => ReturnType;
      /** Empty every selected cell while preserving structure. */
      clearSelectedCells: () => ReturnType;
    };
  }
}

type TableLocation = { node: ProseMirrorNode; pos: number; depth: number };

function findTableAround(editor: Editor): TableLocation | null {
  const $from = editor.state.selection.$from;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'table') {
      return { node, pos: $from.before(depth), depth };
    }
  }
  return null;
}

/** Walk from the caret outward to find the cell index (accounting for colspan) within its row. */
function findCellColumnIndex(editor: Editor, tableDepth: number): number {
  const $from = editor.state.selection.$from;
  for (let depth = $from.depth; depth >= tableDepth; depth -= 1) {
    const parent = $from.node(depth - 1);
    if (parent?.type.name === 'tableRow') {
      const indexInRow = $from.index(depth - 1);
      let column = 0;
      for (let i = 0; i < indexInRow; i += 1) {
        column += parent.child(i).attrs.colspan ?? 1;
      }
      return column;
    }
  }
  return 0;
}

function rowIsHeader(row: ProseMirrorNode): boolean {
  if (!row.firstChild) return false;
  return row.firstChild.type.name === 'tableHeader';
}

/**
 * Returns the cell that occupies `targetCol` in `row`, walking colspan-aware.
 * If the column is past the row's logical width, the last cell is returned.
 */
function cellAtColumn(row: ProseMirrorNode, targetCol: number): ProseMirrorNode | null {
  let col = 0;
  for (let i = 0; i < row.childCount; i += 1) {
    const cell = row.child(i);
    const span = cell.attrs.colspan ?? 1;
    if (targetCol < col + span) return cell;
    col += span;
  }
  return row.lastChild ?? null;
}

function cellTextForSort(cell: ProseMirrorNode | null): string {
  return (cell?.textContent ?? '').trim();
}

/**
 * Compares two cell strings in a way that "feels right" for ad-hoc sorting:
 * pure numbers compare numerically, parseable dates compare chronologically,
 * everything else collates with locale-aware natural ordering.
 */
function compareCellText(a: string, b: string): number {
  const na = Number.parseFloat(a.replace(/,/g, ''));
  const nb = Number.parseFloat(b.replace(/,/g, ''));
  if (
    !Number.isNaN(na) &&
    !Number.isNaN(nb) &&
    Number.isFinite(na) &&
    Number.isFinite(nb) &&
    /^-?[\d.,]+$/.test(a) &&
    /^-?[\d.,]+$/.test(b)
  ) {
    return na - nb;
  }
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (!Number.isNaN(da) && !Number.isNaN(db)) {
    return da - db;
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Adds non-structural conveniences for tables: caret exit, even column distribution,
 * column sorting, and bulk cell clearing. Structural ops live on the upstream Table extension.
 */
export const TableKeymap = Extension.create({
  name: 'scribeTableKeymap',
  priority: 200,

  addCommands() {
    return {
      exitTable:
        () =>
        ({ tr, dispatch, editor, state }: CommandProps) => {
          const location = findTableAround(editor);
          if (!location) return false;
          const after = location.pos + location.node.nodeSize;
          if (dispatch) {
            const paragraph = state.schema.nodes.paragraph?.create();
            if (!paragraph) return false;
            tr.insert(after, paragraph);
            tr.setSelection(TextSelection.create(tr.doc, after + 1));
            tr.scrollIntoView();
          }
          return true;
        },

      distributeTableColumns:
        () =>
        ({ tr, dispatch, editor }: CommandProps) => {
          const location = findTableAround(editor);
          if (!location) return false;
          if (!dispatch) return true;
          const tableContentStart = location.pos + 1;
          location.node.descendants((node, relativePos) => {
            if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
              const abs = tableContentStart + relativePos;
              tr.setNodeMarkup(abs, undefined, { ...node.attrs, colwidth: null });
              return false;
            }
            return true;
          });
          return true;
        },

      sortTableByColumn:
        (direction: TableSortDirection) =>
        ({ tr, dispatch, editor }: CommandProps) => {
          const location = findTableAround(editor);
          if (!location) return false;
          if (location.node.childCount < 2) return false;

          const column = findCellColumnIndex(editor, location.depth);
          const firstRow = location.node.firstChild;
          if (!firstRow) return false;
          const hasHeader = rowIsHeader(firstRow);
          const dataStart = hasHeader ? 1 : 0;
          if (location.node.childCount - dataStart < 2) return false;

          const dataRows: ProseMirrorNode[] = [];
          for (let i = dataStart; i < location.node.childCount; i += 1) {
            dataRows.push(location.node.child(i));
          }

          dataRows.sort((a, b) => {
            const cmp = compareCellText(
              cellTextForSort(cellAtColumn(a, column)),
              cellTextForSort(cellAtColumn(b, column)),
            );
            return direction === 'asc' ? cmp : -cmp;
          });

          const reordered: ProseMirrorNode[] = hasHeader ? [firstRow, ...dataRows] : dataRows;

          if (dispatch) {
            const newTable = location.node.type.create(location.node.attrs, reordered);
            tr.replaceWith(location.pos, location.pos + location.node.nodeSize, newTable);
            tr.scrollIntoView();
          }
          return true;
        },

      clearSelectedCells:
        () =>
        ({ tr, dispatch, state }: CommandProps) => {
          const cellPositions: Array<{ pos: number; size: number }> = [];
          const { from, to } = state.selection;
          tr.doc.nodesBetween(from, to, (node, pos) => {
            if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
              cellPositions.push({ pos, size: node.nodeSize });
              return false;
            }
            return true;
          });

          if (cellPositions.length === 0) return false;
          if (!dispatch) return true;

          const empty = state.schema.nodes.paragraph;
          if (!empty) return false;
          // Clear from the back so positions don't shift mid-loop.
          cellPositions
            .sort((a, b) => b.pos - a.pos)
            .forEach(({ pos, size }) => {
              tr.replaceWith(pos + 1, pos + size - 1, empty.create());
            });

          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => {
        if (!this.editor.isActive('table')) return false;
        return this.editor.commands.exitTable();
      },
    };
  },
});
