import { editableIds, writeCells } from './gridWrite';
import type { CellPos } from './gridRange';
import type { RowChange, WritableColumn } from './gridWrite';
import type { Row } from 'composables/useDataGrid';

/**
 * Delete/Backspace over a block of cells: sets to null every cell a person
 * could type into (its column has an editor). Read-only columns (Status, the
 * checkbox column, any column without an editor or not in `columns`) are
 * never written. Cells that are already blank are skipped, so `touchedIds`
 * lists, in row order, only rows that lost a value. Untouched rows keep their
 * identity, and when nothing is cleared `rows` comes back as is.
 */
export function clearCells(
  rows: ReadonlyArray<Row>,
  cells: ReadonlyArray<ReadonlyArray<CellPos>>,
  columns: ReadonlyArray<WritableColumn>,
): RowChange {
  const editable = editableIds(columns);
  const writes = new Map<string, Record<string, null>>();
  for (const { rowId, colId } of cells.flat()) {
    if (editable.has(colId)) {
      writes.set(rowId, { ...writes.get(rowId), [colId]: null });
    }
  }
  return writeCells(rows, writes);
}
