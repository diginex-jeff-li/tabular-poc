/**
 * Active cell and range math over the visible grid. Positions are ids, never
 * indexes, so a position survives sorting, filtering and row inserts; every
 * function resolves ids against the `GridOrder` it is given.
 *
 * Keys map to `Dir` as in a spreadsheet's range mode: Tab is `right` and
 * Shift+Tab is `left`, and both stop at the row's edge instead of wrapping to
 * the next row.
 */

/** A cell, by row id and column id. */
export type CellPos = { rowId: string; colId: string };

/** What the grid shows, in screen order: sorted and filtered row ids, visible column ids. */
export type GridOrder = {
  rowIds: ReadonlyArray<string>;
  colIds: ReadonlyArray<string>;
};

/** The block between the cell a selection started on (anchor) and the cell that moves (focus). */
export type Range = { anchor: CellPos; focus: CellPos };

/**
 * `home`/`end`: first/last column of the row. `top`/`bottom`: first/last row
 * of the column. `first`/`last`: the grid's top-left/bottom-right cell.
 */
export type Dir =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'home'
  | 'end'
  | 'top'
  | 'bottom'
  | 'first'
  | 'last';

type At = { row: number; col: number };

const TARGET: Record<Dir, (at: At, last: At) => At> = {
  up: (at) => ({ row: at.row - 1, col: at.col }),
  down: (at) => ({ row: at.row + 1, col: at.col }),
  left: (at) => ({ row: at.row, col: at.col - 1 }),
  right: (at) => ({ row: at.row, col: at.col + 1 }),
  home: (at) => ({ row: at.row, col: 0 }),
  end: (at, last) => ({ row: at.row, col: last.col }),
  top: (at) => ({ row: 0, col: at.col }),
  bottom: (at, last) => ({ row: last.row, col: at.col }),
  first: () => ({ row: 0, col: 0 }),
  last: (_at, last) => last,
};

/**
 * The cell one step from `pos`, clamped to the visible grid. Returns `pos`
 * itself when the step goes nowhere, and when `pos` is not visible
 * (`reconcile` first).
 */
export function move(pos: CellPos, dir: Dir, order: GridOrder): CellPos {
  const at = {
    row: order.rowIds.indexOf(pos.rowId),
    col: order.colIds.indexOf(pos.colId),
  };
  if (at.row === -1 || at.col === -1) {
    return pos;
  }
  const last = { row: order.rowIds.length - 1, col: order.colIds.length - 1 };
  const to = TARGET[dir](at, last);
  const row = Math.min(Math.max(to.row, 0), last.row);
  const col = Math.min(Math.max(to.col, 0), last.col);
  return row === at.row && col === at.col
    ? pos
    : { rowId: order.rowIds[row], colId: order.colIds[col] };
}

/** Moves the focus one step and keeps the anchor. Returns `range` itself when the focus stays. */
export function extend(range: Range, dir: Dir, order: GridOrder): Range {
  const focus = move(range.focus, dir, order);
  return focus === range.focus ? range : { anchor: range.anchor, focus };
}

/**
 * The visible cells in the range, row-major: one array per row, top to
 * bottom, each left to right, whichever corner the anchor is on. Empty when
 * the anchor or focus is not visible.
 */
export function cellsIn(range: Range, order: GridOrder): Array<Array<CellPos>> {
  const rowIds = span(order.rowIds, range.anchor.rowId, range.focus.rowId);
  const colIds = span(order.colIds, range.anchor.colId, range.focus.colId);
  return colIds.length === 0
    ? []
    : rowIds.map((rowId) => colIds.map((colId) => ({ rowId, colId })));
}

/** The whole row, first to last visible column. Null when no column is visible. */
export function rowRange(rowId: string, order: GridOrder): Range | null {
  const first = order.colIds[0];
  const last = order.colIds.at(-1);
  return first === undefined || last === undefined
    ? null
    : { anchor: { rowId, colId: first }, focus: { rowId, colId: last } };
}

/** The whole column, first to last visible row. Null when no row is visible. */
export function colRange(colId: string, order: GridOrder): Range | null {
  const first = order.rowIds[0];
  const last = order.rowIds.at(-1);
  return first === undefined || last === undefined
    ? null
    : { anchor: { rowId: first, colId }, focus: { rowId: last, colId } };
}

/**
 * Fits a range to a new order after rows or columns were deleted, filtered
 * out or hidden. A cell that vanished is replaced by the nearest one still
 * visible in `prev`'s order: the next one after it (the row that slid into
 * its place), else the closest before it. A vanished anchor collapses the
 * range to that one cell; a vanished focus only moves the focus. Returns
 * `range` itself when nothing vanished, and null when no cell is visible.
 */
export function reconcile(
  range: Range,
  prev: GridOrder,
  next: GridOrder,
): Range | null {
  const anchor = nearest(range.anchor, prev, next);
  if (!anchor) {
    return null;
  }
  if (anchor !== range.anchor) {
    return { anchor, focus: anchor };
  }
  const focus = nearest(range.focus, prev, next);
  return focus === range.focus ? range : { anchor, focus };
}

function span(
  ids: ReadonlyArray<string>,
  from: string,
  to: string,
): ReadonlyArray<string> {
  const a = ids.indexOf(from);
  const b = ids.indexOf(to);
  return a === -1 || b === -1
    ? []
    : ids.slice(Math.min(a, b), Math.max(a, b) + 1);
}

function nearest(
  pos: CellPos,
  prev: GridOrder,
  next: GridOrder,
): CellPos | null {
  const rowId = nearestId(pos.rowId, prev.rowIds, next.rowIds);
  const colId = nearestId(pos.colId, prev.colIds, next.colIds);
  if (rowId === undefined || colId === undefined) {
    return null;
  }
  return rowId === pos.rowId && colId === pos.colId ? pos : { rowId, colId };
}

function nearestId(
  id: string,
  prev: ReadonlyArray<string>,
  next: ReadonlyArray<string>,
): string | undefined {
  if (next.includes(id)) {
    return id;
  }
  const visible = new Set(next);
  const at = prev.indexOf(id);
  const after = prev.slice(at + 1).find((other) => visible.has(other));
  const before =
    at === -1
      ? undefined
      : prev.slice(0, at).findLast((other) => visible.has(other));
  return after ?? before ?? next[0];
}
