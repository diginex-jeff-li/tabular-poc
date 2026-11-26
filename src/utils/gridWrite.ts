import { parseTsv } from './gridClipboard';
import { cellsIn } from './gridRange';
import type { GridColumn, Row } from './gridApi';
import type { CellPos, GridOrder, Range } from './gridRange';

/**
 * A person's write as data: the rows after it, and the ids of the rows it
 * added, changed or removed. `rows` is the input array itself when nothing
 * changed. Unchanged rows keep their identity.
 */
export type RowChange = {
  rows: ReadonlyArray<Row>;
  touchedIds: Array<string>;
};

/** The column fields the write rules read. */
export type WritableColumn = Pick<GridColumn, 'id' | 'editor'>;

/** The ids of the columns a person can type into. */
function editableIds(
  columns: ReadonlyArray<WritableColumn>,
): ReadonlySet<string> {
  return new Set(columns.flatMap((c) => (c.editor === null ? [] : [c.id])));
}

/** Blank equals blank (null, undefined, ''); anything else compares strictly. */
function sameCell(a: unknown, b: unknown): boolean {
  const blanks = [a, b].map((v) => v === null || v === undefined || v === '');
  return blanks[0] || blanks[1] ? blanks[0] && blanks[1] : a === b;
}

/**
 * Writes field values into rows by id. Only values that change (`sameCell`)
 * are written, and only a row with one is touched and replaced;
 * `touchedIds` follow row order. Ids that aren't in `rows` are ignored.
 */
export function writeCells(
  rows: ReadonlyArray<Row>,
  writes: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
): RowChange {
  const touchedIds: Array<string> = [];
  const next = rows.map((row) => {
    const changed = Object.entries(writes.get(row.id) ?? {}).filter(
      ([colId, value]) => !sameCell(row[colId], value),
    );
    if (changed.length === 0) {
      return row;
    }
    touchedIds.push(row.id);
    return { ...row, ...Object.fromEntries(changed) };
  });
  return { rows: touchedIds.length ? next : rows, touchedIds };
}

/** Appends rows at the bottom, each with a fresh id (an `id` given is replaced). */
export function appendRows(
  rows: ReadonlyArray<Row>,
  added: ReadonlyArray<Record<string, unknown>>,
): RowChange {
  if (added.length === 0) {
    return { rows, touchedIds: [] };
  }
  const fresh = added.map((row) => ({ ...row, id: crypto.randomUUID() }));
  return { rows: [...rows, ...fresh], touchedIds: fresh.map((row) => row.id) };
}

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

/**
 * Paste over the grid, as in Excel: the block is written at its own size
 * from `origin` (the range's top-left cell), rightward over the visible
 * editable columns and downward over the visible rows, in screen order.
 * Read-only and hidden columns are skipped, not consumed; cells past the
 * last editable column are dropped. A blank line writes blank cells. Lines
 * past the last visible row become new rows at the bottom (fresh ids), unless
 * every cell in them is blank. Values are written as pasted (no
 * `pasteParser`); a cell that keeps its value doesn't touch its row.
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
  const fields = parseTsv(text).map((line) =>
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
