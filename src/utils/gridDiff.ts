import type { Row } from './gridApi';

/** How the grid's rows differ from the rows last loaded or saved, by id. */
export interface RowDiff {
  /** Rows that are new since the snapshot, in grid order. */
  added: Array<Row>;
  /** Rows whose fields differ from the snapshot, in grid order. */
  modified: Array<Row>;
  /** Ids of snapshot rows that are gone, in snapshot order. */
  deleted: Array<string>;
}

export interface SavePayload {
  upserts: Array<Row>;
  deletes: Array<string>;
}

type Normalize = (row: Record<string, unknown>) => Record<string, unknown>;

/**
 * Compares the current rows against the snapshot by id. A row is modified
 * when any field differs after `normalize` runs on both sides, so an edit
 * that is reverted is not a change. A row added and deleted between two
 * snapshots appears nowhere.
 */
export function diffRows(
  snapshot: ReadonlyArray<Row>,
  rows: ReadonlyArray<Row>,
  normalize: Normalize = (row) => row,
): RowDiff {
  const before = new Map(snapshot.map((row) => [row.id, row]));
  const diff: RowDiff = { added: [], modified: [], deleted: [] };
  const present = new Set<string>();
  for (const row of rows) {
    present.add(row.id);
    const old = before.get(row.id);
    if (!old) {
      diff.added.push(row);
    } else if (!sameFields(normalize(old), normalize(row))) {
      diff.modified.push(row);
    }
  }
  for (const row of snapshot) {
    if (!present.has(row.id)) {
      diff.deleted.push(row.id);
    }
  }
  return diff;
}

/** The save request: added and modified rows are upserted, deleted ids sent. */
export function buildSavePayload(diff: RowDiff): SavePayload {
  return {
    upserts: [...diff.added, ...diff.modified].map((row) => ({ ...row })),
    deletes: [...diff.deleted],
  };
}

/** A missing field and an `undefined` one are the same field. */
function sameFields(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!sameValue(a[key], b[key])) {
      return false;
    }
  }
  return true;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  return (
    typeof a === 'object' &&
    typeof b === 'object' &&
    a !== null &&
    b !== null &&
    JSON.stringify(a) === JSON.stringify(b)
  );
}

/**
 * Ids of the rows that differ between two states of the grid: present in
 * only one, or a different row object (rows are never mutated, so identity
 * is change). `after`'s order, then rows only in `before`.
 */
export function changedIds(
  before: ReadonlyArray<Row>,
  after: ReadonlyArray<Row>,
): Array<string> {
  const old = new Map(before.map((row) => [row.id, row]));
  const ids = after.flatMap((row) => {
    const prev = old.get(row.id);
    old.delete(row.id);
    return prev === row ? [] : [row.id];
  });
  return [...ids, ...old.keys()];
}
