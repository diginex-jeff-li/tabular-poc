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
export type Editing = { pos: CellPos; seed: string | null };

/**
 * Everything a person is doing in the grid, by row and column id. The active
 * cell is the range's anchor; one selected cell is a range whose anchor and
 * focus are the same cell.
 */
export type GridInteraction = { range: Range | null; editing: Editing | null };

export interface GridSelection {
  state: Readonly<ShallowRef<GridInteraction>>;
  active: ComputedRef<CellPos | null>;
  isActive: (rowId: string, colId: string) => boolean;
  isSelected: (rowId: string, colId: string) => boolean;
  isEditing: (rowId: string, colId: string) => boolean;
  /** The range's visible cells, row-major. */
  cells: () => Array<Array<CellPos>>;
  /** A click: the cell becomes the range, or with `extend` the range's new focus. */
  select: (pos: CellPos, extend?: boolean) => void;
  /** A drag over `pos` with the button held: moves the focus there. */
  dragTo: (pos: CellPos) => void;
  /** A key move: the active cell moves (collapsing the range), or with `extend` the focus. */
  step: (dir: Dir, extend?: boolean) => boolean;
  selectRow: (rowId: string) => void;
  selectColumn: (colId: string) => void;
  startEdit: (pos: CellPos, seed: string | null) => void;
  stopEdit: () => void;
}

const same = (a: CellPos, b: CellPos) =>
  a.rowId === b.rowId && a.colId === b.colId;

/**
 * Active cell, range and editing cell over the grid's visible `order`
 * (sorted and filtered row ids, visible column ids). When the order changes,
 * the range is fitted to it (`reconcile`) and an edit on a row that left the
 * view ends.
 */
export function useGridSelection(
  order: Readonly<Ref<GridOrder>>,
): GridSelection {
  const state = shallowRef<GridInteraction>({ range: null, editing: null });
  const active = computed(() => state.value.range?.anchor ?? null);
  // The rows and columns the range spans, for per-cell lookups.
  const covered = computed(() => {
    const cells = state.value.range
      ? cellsIn(state.value.range, order.value)
      : [];
    return {
      rowIds: new Set(cells.map((line) => line[0].rowId)),
      colIds: new Set(cells[0]?.map((cell) => cell.colId)),
    };
  });

  function setRange(range: Range | null) {
    if (range !== state.value.range) {
      state.value = { ...state.value, range };
    }
  }

  watch(order, (next, prev) => {
    const { range, editing } = state.value;
    const fitted = range && reconcile(range, prev, next);
    const stillEditing =
      editing && next.rowIds.includes(editing.pos.rowId) ? editing : null;
    if (fitted !== range || stillEditing !== editing) {
      state.value = { range: fitted, editing: stillEditing };
    }
  });

  return {
    state,
    active,
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
    cells: () =>
      state.value.range ? cellsIn(state.value.range, order.value) : [],
    select(pos, extendRange = false) {
      const range = state.value.range;
      setRange(
        extendRange && range
          ? { anchor: range.anchor, focus: pos }
          : { anchor: pos, focus: pos },
      );
    },
    dragTo(pos) {
      const range = state.value.range;
      if (range && !same(range.focus, pos)) {
        setRange({ anchor: range.anchor, focus: pos });
      }
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
    startEdit(pos, seed) {
      state.value = {
        range: { anchor: pos, focus: pos },
        editing: { pos, seed },
      };
    },
    stopEdit() {
      if (state.value.editing) {
        state.value = { ...state.value, editing: null };
      }
    },
  };
}
