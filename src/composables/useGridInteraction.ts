import type { DataGridState } from './useDataGrid';
import type { GridSelection } from './useGridSelection';
import type { GridColumn } from 'utils/gridApi';
import type { CellPos, Dir, GridOrder } from 'utils/gridRange';
import type { Ref } from 'vue';

/**
 * How an edit ends: commit `value` (null cancels), then move `dir`.
 * `refocus` hands focus back to the grid; a blur doesn't, because the person
 * already moved focus somewhere.
 */
export type EditEnd = {
  value: string | null;
  dir: Dir | null;
  refocus: boolean;
};

/**
 * Where a key was typed. `grid`: the grid root or a cell. `text`: a text
 * field, an open editor or a dialog, where every key keeps its native
 * meaning. `page`: anywhere else (a toolbar or header button), where only
 * undo and redo apply.
 */
export type KeySource = 'grid' | 'page' | 'text';

/** A key press, as the DOM listener read it. */
export type GridKey = {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  from: KeySource;
};

/** What the DOM must do after a key or an edit end. */
export type GridEffect = {
  /** The browser's own action for the key (scroll, focus move, back) must not run. */
  preventDefault: boolean;
  /** Scroll the least distance that shows this cell. */
  reveal: CellPos | null;
  /** Focus returns to the grid once the editor is gone. */
  focusGrid: boolean;
};

/**
 * Turns a key, an edit's start or end, and a button release into selection
 * changes and person writes, and says what the DOM must do about them.
 */
export interface GridInteraction {
  keydown: (key: GridKey) => GridEffect;
  /** Opens the editor on `pos` when its column has one; `seed` replaces the value. */
  startEdit: (pos: CellPos, seed: string | null) => void;
  /**
   * Ends the edit on `pos`: commits the value, then steps `dir`. Idempotent:
   * a blur after Enter, Tab or Escape, or a pick then the menu closing,
   * finds the edit already ended and does nothing.
   */
  endEdit: (pos: CellPos, end: EditEnd) => GridEffect;
  /** The button is released: the press ends and a running fill is written, as one person write. */
  release: () => void;
}

const NONE: GridEffect = {
  preventDefault: false,
  reveal: null,
  focusGrid: false,
};
const PREVENT: GridEffect = { ...NONE, preventDefault: true };

/** ⌘/Ctrl+Z undoes; ⌘/Ctrl+Shift+Z and Ctrl+Y redo. */
function historyKey(k: GridKey): 'undo' | 'redo' | null {
  const key = k.key.toLowerCase();
  if ((k.metaKey || k.ctrlKey) && !k.altKey && key === 'z') {
    return k.shiftKey ? 'redo' : 'undo';
  }
  return k.ctrlKey && !k.metaKey && !k.shiftKey && key === 'y' ? 'redo' : null;
}

/**
 * Arrows step one cell, or with Ctrl/Cmd jump to the edge. Home/End go to the
 * row's ends, or with Ctrl/Cmd to the grid's first/last cell (as in Excel).
 */
const MOVES: Partial<Record<string, readonly [Dir, Dir]>> = {
  ArrowUp: ['up', 'top'],
  ArrowDown: ['down', 'bottom'],
  ArrowLeft: ['left', 'home'],
  ArrowRight: ['right', 'end'],
  Home: ['home', 'first'],
  End: ['end', 'last'],
};

/** Where a key moves the active cell. Tab stops at the row's edge instead of wrapping to the next row. */
function keyDir(k: GridKey): Dir | null {
  const moves = MOVES[k.key];
  if (moves) {
    return moves[k.ctrlKey || k.metaKey ? 1 : 0];
  }
  return k.key === 'Tab' ? (k.shiftKey ? 'left' : 'right') : null;
}

export function useGridInteraction({
  selection,
  grid,
  columns,
  order,
}: {
  selection: GridSelection;
  grid: DataGridState;
  columns: ReadonlyArray<GridColumn>;
  order: Readonly<Ref<GridOrder>>;
}): GridInteraction {
  const editable = new Set(columns.filter((c) => c.editor).map((c) => c.id));

  function startEdit(pos: CellPos, seed: string | null) {
    if (editable.has(pos.colId)) {
      selection.startEdit(pos, seed);
    }
  }

  /** Steps the active cell, or with `extend` the range's focus; the cell to reveal, or null when nothing moved. */
  function step(dir: Dir, extend: boolean): CellPos | null {
    return selection.step(dir, extend)
      ? (selection.state.value.range?.focus ?? null)
      : null;
  }

  function navigate(k: GridKey, dir: Dir): GridEffect {
    const tab = k.key === 'Tab';
    if (!selection.active.value) {
      // The first move selects the top-left cell; Tab leaves the grid.
      const rowId = order.value.rowIds[0];
      const colId = order.value.colIds[0];
      if (tab || rowId === undefined || colId === undefined) {
        return NONE;
      }
      selection.select({ rowId, colId });
      return PREVENT;
    }
    const reveal = step(dir, k.shiftKey && !tab);
    // Tab at the row's edge leaves the grid instead of trapping focus.
    return { ...NONE, preventDefault: reveal !== null || !tab, reveal };
  }

  /** A grid key that moves nothing: clear, deselect, or start an edit. */
  function act(k: GridKey): GridEffect {
    const pos = selection.active.value;
    switch (k.key) {
      case 'Delete':
      case 'Backspace':
        // Swallowed even with nothing to clear: some browsers go back.
        grid.clearCells(selection.cells());
        return PREVENT;
      case 'Escape':
        // Nothing selected: the next paste appends rows.
        selection.clear();
        return NONE;
      default: {
        // Enter opens the editor; typing a character replaces the value, as in Excel.
        const types =
          k.key.length === 1 && !k.ctrlKey && !k.metaKey && !k.altKey;
        if (!pos || (k.key !== 'Enter' && !types)) {
          return NONE;
        }
        startEdit(pos, k.key === 'Enter' ? null : k.key);
        return PREVENT;
      }
    }
  }

  return {
    keydown(k) {
      if (k.from === 'text') {
        return NONE;
      }
      const history = historyKey(k);
      if (history === 'undo') {
        grid.undo();
        return PREVENT;
      }
      if (history === 'redo') {
        grid.redo();
        return PREVENT;
      }
      if (k.from !== 'grid') {
        return NONE;
      }
      const dir = keyDir(k);
      return dir ? navigate(k, dir) : act(k);
    },
    startEdit,
    endEdit(pos, { value, dir, refocus }) {
      if (!selection.isEditing(pos.rowId, pos.colId)) {
        return NONE;
      }
      selection.stopEdit();
      if (value !== null) {
        grid.editCell(pos, value);
      }
      return {
        preventDefault: false,
        reveal: dir ? step(dir, false) : null,
        focusGrid: refocus,
      };
    },
    release() {
      const fill = selection.release();
      if (fill) {
        grid.fillDrag(order.value, fill);
      }
    },
  };
}
