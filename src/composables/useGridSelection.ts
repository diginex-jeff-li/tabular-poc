import {
  cellsIn,
  colRange,
  extend,
  move,
  reconcile,
  rowRange,
} from 'utils/gridRange';
import { computed, shallowRef, watch } from 'vue';
import type { CellPos, Dir, GridOrder, Range } from 'utils/gridRange';
import type { ComputedRef, Ref, ShallowRef } from 'vue';

/**
 * The cell being edited. `seed` is the character typed to start editing,
 * which replaces the value (as in Excel); null starts from the value.
 */
type Editing = { pos: CellPos; seed: string | null };

/** A fill-handle drag: the range it copies and the row the pointer is on. */
type Fill = { source: Range; toRowId: string };

/**
 * Where a press on a cell landed: the cell itself, its fill handle, or a
 * control inside it (a button), which selects the cell but starts no drag.
 */
export type PressTarget = 'cell' | 'fillHandle' | 'control';

/**
 * Everything a person is doing in the grid, by row and column id. The active
 * cell is the range's anchor; one selected cell is a range whose anchor and
 * focus are the same cell. Editing and filling never overlap: starting an
 * edit ends a fill, and a fill only starts while nothing is edited.
 */
type SelectionState = {
  range: Range | null;
  editing: Editing | null;
  fill: Fill | null;
};

export interface GridSelection {
  state: Readonly<ShallowRef<SelectionState>>;
  active: ComputedRef<CellPos | null>;
  /**
   * The button is held after a press on a cell and nothing is edited: the
   * pointer drags the range's focus, or the fill's target row.
   */
  dragging: ComputedRef<boolean>;
  isActive: (rowId: string, colId: string) => boolean;
  isSelected: (rowId: string, colId: string) => boolean;
  isEditing: (rowId: string, colId: string) => boolean;
  /** The range's bottom-right cell on screen, where the fill handle sits. */
  isCorner: (rowId: string, colId: string) => boolean;
  /** In the rows a fill drag would write, within the source's columns. */
  isFillTarget: (rowId: string, colId: string) => boolean;
  /** The range's visible cells, row-major. */
  cells: () => Array<Array<CellPos>>;
  /** A click: the cell becomes the range, or with `extend` the range's new focus. */
  select: (pos: CellPos, extend?: boolean) => void;
  /**
   * The primary button goes down on `pos`: selects it (with `extend`, as the
   * range's new focus), or on the fill handle starts a fill from the range.
   * Does nothing on the cell being edited.
   */
  press: (pos: CellPos, how: { extend: boolean; target: PressTarget }) => void;
  /** The pointer enters `pos`: while `dragging`, the drag moves there. */
  enter: (pos: CellPos) => void;
  /**
   * The button is released: the press ends, and a running fill ends and is
   * returned once, with the range grown over the rows it filled.
   */
  release: () => Fill | null;
  /** A key move: the active cell moves (collapsing the range), or with `extend` the focus. */
  step: (dir: Dir, extend?: boolean) => boolean;
  selectRow: (rowId: string) => void;
  selectColumn: (colId: string) => void;
  /** Nothing selected: the next paste appends. */
  clear: () => void;
  startEdit: (pos: CellPos, seed: string | null) => void;
  stopEdit: () => void;
}

const same = (a: CellPos, b: CellPos) =>
  a.rowId === b.rowId && a.colId === b.colId;

/** The range covering `source` and the rows up to `toRowId`. */
function filledRange(source: Range, toRowId: string, order: GridOrder): Range {
  const cells = cellsIn(source, order);
  const first = cells[0]?.[0];
  const last = cells.at(-1)?.at(-1);
  const to = order.rowIds.indexOf(toRowId);
  if (!first || !last || to === -1) {
    return source;
  }
  if (to > order.rowIds.indexOf(last.rowId)) {
    return { anchor: first, focus: { rowId: toRowId, colId: last.colId } };
  }
  if (to < order.rowIds.indexOf(first.rowId)) {
    return { anchor: { rowId: toRowId, colId: first.colId }, focus: last };
  }
  return source;
}

/**
 * Active cell, range, editing cell and the press gesture over the grid's
 * visible `order` (sorted and filtered row ids, visible column ids in screen
 * order). When the order changes, the range and a running fill's source are
 * fitted to it (`reconcile`) and an edit on a row that left the view ends.
 */
export function useGridSelection(
  order: Readonly<Ref<GridOrder>>,
): GridSelection {
  const state = shallowRef<SelectionState>({
    range: null,
    editing: null,
    fill: null,
  });
  // The primary button is down after a press on a cell (not on a control).
  // Kept out of `state`, so a press or release alone re-runs no cell computed.
  const held = shallowRef(false);
  const dragging = computed(() => held.value && state.value.editing === null);
  const active = computed(() => state.value.range?.anchor ?? null);
  // The rows and columns the range spans, for per-cell lookups.
  const covered = computed(() => {
    const cells = state.value.range
      ? cellsIn(state.value.range, order.value)
      : [];
    return {
      rowIds: new Set(cells.map((line) => line[0].rowId)),
      colIds: new Set(cells[0]?.map((cell) => cell.colId)),
      corner: cells.at(-1)?.at(-1) ?? null,
    };
  });
  // The rows a running fill would write, with the source's columns.
  const fillTarget = computed(() => {
    const fill = state.value.fill;
    if (!fill) {
      return null;
    }
    const grown = cellsIn(
      filledRange(fill.source, fill.toRowId, order.value),
      order.value,
    );
    const source = new Set(
      cellsIn(fill.source, order.value).map((line) => line[0].rowId),
    );
    return {
      rowIds: new Set(
        grown.map((line) => line[0].rowId).filter((id) => !source.has(id)),
      ),
      colIds: new Set(grown[0]?.map((cell) => cell.colId)),
    };
  });

  function setRange(range: Range | null) {
    if (range !== state.value.range) {
      state.value = { ...state.value, range };
    }
  }

  function select(pos: CellPos, extendRange = false) {
    const range = state.value.range;
    setRange(
      extendRange && range
        ? { anchor: range.anchor, focus: pos }
        : { anchor: pos, focus: pos },
    );
  }

  watch(order, (next, prev) => {
    const { range, editing, fill } = state.value;
    const fitted = range && reconcile(range, prev, next);
    const source = fill && reconcile(fill.source, prev, next);
    const fittedFill =
      !fill || source === fill.source ? fill : source && { ...fill, source };
    const stillEditing =
      editing && next.rowIds.includes(editing.pos.rowId) ? editing : null;
    if (fitted !== range || fittedFill !== fill || stillEditing !== editing) {
      state.value = {
        range: fitted,
        editing: stillEditing,
        fill: fittedFill,
      };
    }
  });

  return {
    state,
    active,
    dragging,
    isActive: (rowId, colId) => {
      const pos = active.value;
      return pos !== null && pos.rowId === rowId && pos.colId === colId;
    },
    isSelected: (rowId, colId) =>
      covered.value.rowIds.has(rowId) && covered.value.colIds.has(colId),
    isEditing: (rowId, colId) => {
      const pos = state.value.editing?.pos;
      return pos !== undefined && pos.rowId === rowId && pos.colId === colId;
    },
    isCorner: (rowId, colId) => {
      const corner = covered.value.corner;
      return (
        corner !== null && corner.rowId === rowId && corner.colId === colId
      );
    },
    isFillTarget: (rowId, colId) =>
      fillTarget.value !== null &&
      fillTarget.value.rowIds.has(rowId) &&
      fillTarget.value.colIds.has(colId),
    cells: () =>
      state.value.range ? cellsIn(state.value.range, order.value) : [],
    select,
    press(pos, { extend: extendRange, target }) {
      const { range, editing } = state.value;
      if (editing && same(editing.pos, pos)) {
        return;
      }
      if (target !== 'fillHandle') {
        select(pos, extendRange);
      } else if (range && !editing) {
        state.value = {
          ...state.value,
          fill: { source: range, toRowId: range.focus.rowId },
        };
      }
      held.value = target !== 'control';
    },
    enter(pos) {
      if (!dragging.value) {
        return;
      }
      const { range, fill } = state.value;
      if (fill) {
        if (fill.toRowId !== pos.rowId) {
          state.value = {
            ...state.value,
            fill: { source: fill.source, toRowId: pos.rowId },
          };
        }
      } else if (range && !same(range.focus, pos)) {
        setRange({ anchor: range.anchor, focus: pos });
      }
    },
    release() {
      held.value = false;
      const fill = state.value.fill;
      if (!fill) {
        return null;
      }
      state.value = {
        ...state.value,
        range: filledRange(fill.source, fill.toRowId, order.value),
        fill: null,
      };
      return fill;
    },
    step(dir, extendRange = false) {
      const range = state.value.range;
      if (!range) {
        return false;
      }
      if (extendRange) {
        const next = extend(range, dir, order.value);
        setRange(next);
        return next !== range;
      }
      const to = move(range.anchor, dir, order.value);
      if (to === range.anchor && same(range.anchor, range.focus)) {
        return false;
      }
      setRange({ anchor: to, focus: to });
      return true;
    },
    selectRow: (rowId) => setRange(rowRange(rowId, order.value)),
    selectColumn: (colId) => setRange(colRange(colId, order.value)),
    clear() {
      if (state.value.range || state.value.editing || state.value.fill) {
        state.value = { range: null, editing: null, fill: null };
      }
    },
    startEdit(pos, seed) {
      state.value = {
        range: { anchor: pos, focus: pos },
        editing: { pos, seed },
        fill: null,
      };
    },
    stopEdit() {
      if (state.value.editing) {
        state.value = { ...state.value, editing: null };
      }
    },
  };
}
