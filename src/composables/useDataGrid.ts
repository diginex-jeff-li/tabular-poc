import { useEventListener, useManualRefHistory } from '@vueuse/core';
import { parsePositionalPaste } from 'utils/gridClipboard';
import { buildSavePayload, changedIds, diffRows } from 'utils/gridDiff';
import {
  appendRows,
  clearCells as clearCellsIn,
  fillRange,
  overwritePaste,
  writeCells,
} from 'utils/gridWrite';
import { computed, readonly, ref, shallowRef, watch } from 'vue';
import type {
  GridApi,
  GridColumn,
  GridSaveError,
  GridSaveResponse,
  Row,
} from 'utils/gridApi';
import type { SavePayload } from 'utils/gridDiff';
import type { CellPos, GridOrder, Range } from 'utils/gridRange';
import type { RowChange } from 'utils/gridWrite';
import type { ComputedRef, Ref, ShallowRef } from 'vue';

/** Ticked rows by row id (TanStack's `RowSelectionState` shape). */
type RowSelection = Record<string, boolean>;

/** Height of every body row in px, border included. Editors must fit inside it. */
export const ROW_HEIGHT = 36;

const NETWORK_ERROR: GridSaveError = {
  rowId: '',
  field: 'network',
  message: 'Save failed',
};

/**
 * A page's parser for an append paste: the clipboard text in, partial rows
 * out. `positional` gives the default parse (`parsePositionalPaste`).
 */
export type PasteParser = (
  clipboard: string,
  positional: () => Array<Record<string, unknown>>,
) => Array<Record<string, unknown>>;

/**
 * State behind `DataGrid`. `rows` is the single source of truth; the table only renders it.
 *
 * Person writes (edit, paste, fill, clear, Add Row, Delete, Clear all, and
 * `api.importRows`): the touched rows still in the grid run through
 * `normalizeRow`, the previous rows become one undo step (redo is dropped),
 * and `onUserEdit(touchedIds)` is called once, synchronously. A write that
 * changes nothing records no undo step and calls nothing.
 */
export interface DataGridState {
  rows: ShallowRef<ReadonlyArray<Row>>;
  rowCount: ComputedRef<number>;
  /** Controlled `UTable` row selection. */
  rowSelection: Ref<RowSelection>;
  /** Added, modified and deleted rows since the last load or save. */
  dirtyCount: ComputedRef<number>;
  isSaving: Readonly<Ref<boolean>>;
  /** The last save's outcome; cleared when the next change appears. */
  saveResult: Readonly<ShallowRef<GridSaveResponse | null>>;
  /** Backend save errors, including those for rows the save deleted; dropped when their row leaves the grid afterwards. */
  errorList: Readonly<ShallowRef<ReadonlyArray<GridSaveError>>>;
  setRowSelected: (rowId: string, selected: boolean) => void;
  /** Steps back one person write; false when there is none. Reported to `onUserEdit`. */
  undo: () => boolean;
  /** Re-applies the last undone write; false when there is none. Reported to `onUserEdit`. */
  redo: () => boolean;
  /** Inserts an empty row at the top. */
  addRow: () => void;
  /**
   * Programmatic access (`onReady`): a person's import (`importRows`, a
   * person write) and the agent's writes (`addRows`, `updateRows`,
   * `deleteRows`). Agent writes go through `normalizeRow` too, are not
   * reported to `onUserEdit` (the caller already knows what it changed) and
   * are not undoable: a write that changes rows empties the undo and redo
   * history.
   */
  api: GridApi;
  /** Removes the ticked rows. */
  deleteSelected: () => void;
  /** Removes every row; saved ones are sent as deletes on the next save. */
  clearAll: () => void;
  /**
   * A person's edit of one cell. Returns false when the value is unchanged
   * (blank equals blank).
   */
  editCell: (pos: CellPos, value: string) => boolean;
  /**
   * A person's Delete/Backspace over a block: empties its editable,
   * non-blank cells.
   */
  clearCells: (cells: ReadonlyArray<ReadonlyArray<CellPos>>) => void;
  /**
   * A person's paste of clipboard text. With `origin` (the selection's
   * top-left cell) it writes over the grid in screen `order`
   * (`overwritePaste`); without one it appends rows, parsed by the
   * `pasteParser` option or positionally.
   */
  paste: (text: string, order: GridOrder, origin?: CellPos) => void;
  /** A person's fill-handle drag, in screen `order` (`fillRange`). */
  fillDrag: (
    order: GridOrder,
    fill: { source: Range; toRowId: string },
  ) => void;
  save: () => Promise<void>;
}

export function useDataGrid(opts: {
  data: ReadonlyArray<Record<string, unknown>>;
  columns: ReadonlyArray<GridColumn>;
  onSave: (payload: SavePayload) => Promise<GridSaveResponse>;
  normalizeRow?: (row: Record<string, unknown>) => Record<string, unknown>;
  onUserEdit?: (rowIds: Array<string>) => void;
  /** Replaces the positional parse of an append paste. */
  pasteParser?: PasteParser;
}): DataGridState {
  const rows = shallowRef<ReadonlyArray<Row>>(
    opts.data.map((row) =>
      typeof row.id === 'string' && row.id !== ''
        ? (row as Row)
        : { ...row, id: crypto.randomUUID() },
    ),
  );
  const rowCount = computed(() => rows.value.length);
  const rowSelection = ref<RowSelection>({});
  const isSaving = ref(false);
  const saveResult = shallowRef<GridSaveResponse | null>(null);
  const errorList = shallowRef<Array<GridSaveError>>([]);
  // Undo/redo over states of `rows`. Rows are immutable, so a snapshot is the
  // array reference (no clone). A step goes through `replace`, so ticks and
  // save errors of rows that left go with them.
  const history = useManualRefHistory(rows, {
    setSource: (_, next) => replace(next),
  });

  // Baseline at load and after each successful save. Rows are immutable, so
  // the array reference is the snapshot; no clone needed.
  const snapshot = shallowRef(rows.value);
  const diff = computed(() =>
    diffRows(snapshot.value, rows.value, opts.normalizeRow),
  );
  const dirtyCount = computed(
    () =>
      diff.value.added.length +
      diff.value.modified.length +
      diff.value.deleted.length,
  );

  useEventListener(window, 'beforeunload', (e: BeforeUnloadEvent) => {
    if (dirtyCount.value > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // The "Saved N" badge belongs to the saved state; the next change ends it.
  watch(dirtyCount, (count) => {
    if (count > 0) {
      saveResult.value = null;
    }
  });

  /** `row` through `normalizeRow`, keeping its id. */
  function normalized(row: Row): Row {
    return { ...(opts.normalizeRow?.(row) ?? row), id: row.id };
  }

  /** Replaces `rows`; ticks and save errors of rows that left go with them. */
  function replace(next: ReadonlyArray<Row>) {
    rows.value = next;
    const ticked = Object.keys(rowSelection.value);
    if (ticked.length === 0 && errorList.value.length === 0) {
      return;
    }
    const present = new Set(next.map((row) => row.id));
    if (ticked.some((id) => !present.has(id))) {
      rowSelection.value = Object.fromEntries(
        ticked.filter((id) => present.has(id)).map((id) => [id, true]),
      );
    }
    if (errorList.value.some((err) => !present.has(err.rowId))) {
      errorList.value = errorList.value.filter((err) => present.has(err.rowId));
    }
  }

  function setRowSelected(rowId: string, selected: boolean) {
    const { [rowId]: _, ...rest } = rowSelection.value;
    rowSelection.value = selected ? { ...rest, [rowId]: true } : rest;
  }

  /** A person's write; false, and nothing recorded or reported, when it changes nothing. */
  function commit({ rows: next, touchedIds }: RowChange): boolean {
    if (next === rows.value) {
      return false;
    }
    const touched = new Set(touchedIds);
    replace(next.map((row) => (touched.has(row.id) ? normalized(row) : row)));
    history.commit();
    opts.onUserEdit?.(touchedIds);
    return true;
  }

  /** One undo or redo `step`, when `can` allows it; reports the rows it changed. */
  function travel(can: ComputedRef<boolean>, step: () => void): boolean {
    if (!can.value) {
      return false;
    }
    const before = rows.value;
    step();
    opts.onUserEdit?.(changedIds(before, rows.value));
    return true;
  }

  /** An agent's write: not undoable, and the history before it no longer applies. */
  function agentWrite(next: ReadonlyArray<Row>) {
    if (next !== rows.value) {
      replace(next);
      // Commit makes `next` the state undo would leave; clear drops every step.
      history.commit();
      history.clear();
    }
  }

  function addRow() {
    const id = crypto.randomUUID();
    commit({ rows: [{ id }, ...rows.value], touchedIds: [id] });
  }

  function deleteSelected() {
    const ids = rows.value
      .filter((row) => rowSelection.value[row.id])
      .map((row) => row.id);
    const gone = new Set(ids);
    commit({
      rows: ids.length
        ? rows.value.filter((row) => !gone.has(row.id))
        : rows.value,
      touchedIds: ids,
    });
  }

  /** A person brings rows (file import, an applied column mapping): an append paste's write. */
  function importRows(added: ReadonlyArray<Record<string, unknown>>) {
    const change = appendRows(rows.value, added);
    commit(change);
    return change.touchedIds;
  }

  /** The agent appends rows. */
  function addRows(added: ReadonlyArray<Record<string, unknown>>) {
    const change = appendRows(rows.value, added);
    const fresh = new Set(change.touchedIds);
    agentWrite(
      change.rows.map((row) => (fresh.has(row.id) ? normalized(row) : row)),
    );
    return change.touchedIds;
  }

  /** Merges each patch into its row, in order, through `normalizeRow`. */
  function updateRows(patches: ReadonlyArray<Row>): {
    updated: Array<string>;
    missing: Array<string>;
  } {
    const byId = new Map(rows.value.map((row) => [row.id, row]));
    const result = {
      updated: [] as Array<string>,
      missing: [] as Array<string>,
    };
    for (const { id, ...fields } of patches) {
      const row = byId.get(id);
      if (row) {
        byId.set(id, normalized({ ...row, ...fields }));
        result.updated.push(id);
      } else {
        result.missing.push(id);
      }
    }
    if (result.updated.length > 0) {
      agentWrite(rows.value.map((row) => byId.get(row.id) ?? row));
    }
    return result;
  }

  function deleteRows(ids: ReadonlyArray<string>): {
    deleted: Array<string>;
    missing: Array<string>;
  } {
    const present = new Set(rows.value.map((row) => row.id));
    const result = {
      deleted: [] as Array<string>,
      missing: [] as Array<string>,
    };
    for (const id of ids) {
      if (present.delete(id)) {
        result.deleted.push(id);
      } else {
        result.missing.push(id);
      }
    }
    if (result.deleted.length > 0) {
      agentWrite(rows.value.filter((row) => present.has(row.id)));
    }
    return result;
  }

  const api: GridApi = {
    getRows: () => rows.value.map((row) => ({ ...row })),
    importRows,
    addRows,
    updateRows,
    deleteRows,
    showErrors: (errors) => {
      errorList.value = errors;
    },
  };

  function clearAll() {
    commit({ rows: rows.value.length ? [] : rows.value, touchedIds: [] });
    rowSelection.value = {};
    errorList.value = [];
    saveResult.value = null;
  }

  function editCell(pos: CellPos, value: string): boolean {
    return commit(
      writeCells(rows.value, new Map([[pos.rowId, { [pos.colId]: value }]])),
    );
  }

  function clearCells(cells: ReadonlyArray<ReadonlyArray<CellPos>>) {
    commit(clearCellsIn(rows.value, cells, opts.columns));
  }

  function paste(text: string, order: GridOrder, origin?: CellPos) {
    if (origin) {
      commit(overwritePaste(rows.value, order, origin, text, opts.columns));
      return;
    }
    const positional = () => parsePositionalPaste(text, opts.columns);
    commit(
      appendRows(
        rows.value,
        opts.pasteParser?.(text, positional) ?? positional(),
      ),
    );
  }

  function fillDrag(
    order: GridOrder,
    { source, toRowId }: { source: Range; toRowId: string },
  ) {
    commit(fillRange(rows.value, order, source, toRowId, opts.columns));
  }

  async function save() {
    if (isSaving.value) {
      return;
    }
    errorList.value = [];
    const sent = rows.value;
    const payload = buildSavePayload(diff.value);
    if (payload.upserts.length === 0 && payload.deletes.length === 0) {
      saveResult.value = { errors: [], saved: 0 };
      return;
    }
    isSaving.value = true;
    saveResult.value = null;
    try {
      const result = await opts.onSave(payload);
      saveResult.value = result;
      if (result.errors.length > 0) {
        errorList.value = result.errors;
      } else {
        // The rows that were sent, not the current ones: an edit made while
        // the request was in flight stays dirty.
        snapshot.value = sent;
      }
    } catch {
      saveResult.value = { errors: [NETWORK_ERROR], saved: 0 };
    } finally {
      isSaving.value = false;
    }
  }

  return {
    rows,
    rowCount,
    rowSelection,
    dirtyCount,
    isSaving: readonly(isSaving),
    saveResult,
    errorList,
    setRowSelected,
    undo: () => travel(history.canUndo, history.undo),
    redo: () => travel(history.canRedo, history.redo),
    addRow,
    api,
    deleteSelected,
    clearAll,
    editCell,
    clearCells,
    paste,
    fillDrag,
    save,
  };
}
