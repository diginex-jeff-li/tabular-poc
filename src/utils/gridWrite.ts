import type { GridColumn, Row } from './gridApi';

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
export function editableIds(
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
