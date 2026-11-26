import { cellsIn } from './gridRange';
import { editableIds, writeCells } from './gridWrite';
import type { Row } from './gridApi';
import type { GridOrder, Range } from './gridRange';
import type { RowChange, WritableColumn } from './gridWrite';

/**
 * The fill handle: copies the `source` range's rows into the visible rows
 * between it and `toRowId` (below or above it), repeating the pattern: the
 * row `k` rows from the source's top gets source row `k mod height`, so the
 * pattern runs on unbroken in either direction. No numeric series. Only the
 * source's editable columns are written. `toRowId` inside the source, or not
 * visible, writes nothing.
 */
export function fillRange(
  rows: ReadonlyArray<Row>,
  order: GridOrder,
  source: Range,
  toRowId: string,
  columns: ReadonlyArray<WritableColumn>,
): RowChange {
  const editable = editableIds(columns);
  const block = cellsIn(source, order).map((line) =>
    line.filter((cell) => editable.has(cell.colId)),
  );
  const top = order.rowIds.indexOf(block[0]?.[0]?.rowId ?? '');
  const to = order.rowIds.indexOf(toRowId);
  const bottom = top + block.length - 1;
  if (top === -1 || to === -1 || (to >= top && to <= bottom)) {
    return { rows, touchedIds: [] };
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  const [from, end] = to > bottom ? [bottom + 1, to] : [to, top - 1];
  const writes = new Map<string, Record<string, unknown>>();
  for (let at = from; at <= end; at++) {
    const offset = (at - top) % block.length;
    const line = block[(offset + block.length) % block.length];
    writes.set(
      order.rowIds[at],
      Object.fromEntries(
        line.map((cell) => [
          cell.colId,
          byId.get(cell.rowId)?.[cell.colId] ?? null,
        ]),
      ),
    );
  }
  return writeCells(rows, writes);
}
