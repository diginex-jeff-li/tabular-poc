import { appendRows, editableIds, writeCells } from './gridWrite';
import type { CellPos, GridOrder } from './gridRange';
import type { RowChange, WritableColumn } from './gridWrite';
import type { Row } from 'composables/useDataGrid';

/**
 * Pasted text as lines of cells. One trailing line break (Excel ends every
 * copy with one) and a `\r` before each break are dropped; a blank line in
 * the middle is a line of one blank cell.
 */
function tsvLines(text: string): Array<Array<string>> {
  const body = text.replace(/\r?\n$/, '');
  return body === ''
    ? []
    : body.split('\n').map((line) => line.replace(/\r$/, '').split('\t'));
}

/**
 * Paste over the grid, as in Excel: the block is written at its own size
 * from `origin` (the range's top-left cell), rightward over the visible
 * editable columns and downward over the visible rows, in screen order.
 * Read-only and hidden columns are skipped, not consumed; cells past the
 * last editable column are dropped. Lines past the last visible row become
 * new rows at the bottom (fresh ids), unless every cell in them is blank.
 * Values are written as pasted (no `pasteParser`); a cell that keeps its
 * value doesn't touch its row.
 */
export function overwritePaste(
  rows: ReadonlyArray<Row>,
  order: GridOrder,
  origin: CellPos,
  text: string,
  columns: ReadonlyArray<WritableColumn>,
): RowChange {
  const editable = editableIds(columns);
  const startRow = order.rowIds.indexOf(origin.rowId);
  const startCol = order.colIds.indexOf(origin.colId);
  if (startRow === -1 || startCol === -1) {
    return { rows, touchedIds: [] };
  }
  const colIds = order.colIds.slice(startCol).filter((id) => editable.has(id));
  const fields = tsvLines(text).map((line) =>
    Object.fromEntries(
      line.slice(0, colIds.length).map((value, i) => [colIds[i], value]),
    ),
  );
  const rowIds = order.rowIds.slice(startRow, startRow + fields.length);
  const written = writeCells(
    rows,
    new Map(rowIds.map((rowId, i) => [rowId, fields[i]])),
  );
  const added = appendRows(
    written.rows,
    fields
      .slice(rowIds.length)
      .filter((line) => Object.values(line).some((value) => value !== '')),
  );
  return {
    rows: added.rows,
    touchedIds: [...written.touchedIds, ...added.touchedIds],
  };
}
