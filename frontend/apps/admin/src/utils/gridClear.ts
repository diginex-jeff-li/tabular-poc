import type { CellPos } from './gridRange';
import type { GridColumn } from './zodToColumnDefs';
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
  columns: ReadonlyArray<GridColumn>,
): { rows: ReadonlyArray<Row>; touchedIds: Array<string> } {
  const editable = new Set(
    columns.flatMap((c) => (c.editor === null ? [] : [c.id])),
  );
  const targets = new Map<string, Array<string>>();
  for (const { rowId, colId } of cells.flat()) {
    if (editable.has(colId)) {
      targets.set(rowId, [...(targets.get(rowId) ?? []), colId]);
    }
  }

  const touchedIds: Array<string> = [];
  const next = rows.map((row) => {
    const cleared = (targets.get(row.id) ?? []).filter((colId) => {
      const value = row[colId];
      return value !== null && value !== undefined && value !== '';
    });
    if (!cleared.length) {
      return row;
    }
    touchedIds.push(row.id);
    const copy: Row = { ...row };
    for (const colId of cleared) {
      copy[colId] = null;
    }
    return copy;
  });
  return { rows: touchedIds.length ? next : rows, touchedIds };
}
