import { useEventListener } from '@vueuse/core';
import { clearCells as clearCellsIn } from 'utils/gridClear';
import { buildSavePayload, changedIds, diffRows } from 'utils/gridDiff';
import { appendRows, writeCells } from 'utils/gridWrite';
import { computed, readonly, ref, shallowRef, watch } from 'vue';
import type { GridApi, GridSaveError, GridSaveResponse } from 'utils/gridApi';
import type { SavePayload } from 'utils/gridDiff';
import type { CellPos } from 'utils/gridRange';
import type { RowChange, WritableColumn } from 'utils/gridWrite';
import type { ComputedRef, Ref, ShallowRef } from 'vue';

/** A grid row. Rows are never mutated; every change replaces the row and the array. */
export type Row = Record<string, unknown> & { id: string };

/** Ticked rows by row id (TanStack's `RowSelectionState` shape). */
type RowSelection = Record<string, boolean>;

/** Height of every body row in px, border included. Editors must fit inside it. */
export const ROW_HEIGHT = 36;

const NETWORK_ERROR: GridSaveError = {
  row: 0,
  rowId: '',
  field: 'network',
  message: 'Save failed',
};

/** State behind `DataGrid`. `rows` is the single source of truth; the table only renders it. */
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
  /** Backend save errors for rows still in the grid. */
  errorList: Readonly<ShallowRef<ReadonlyArray<GridSaveError>>>;
  setRowSelected: (rowId: string, selected: boolean) => void;
  /**
   * Every person write goes through here (edit, paste, fill, clear, Add Row,
   * Delete, Clear all): the touched rows still in the grid run through
   * `normalizeRow`, the previous rows become one undo step (redo is
   * dropped), and `onUserEdit(touchedIds)` is called once. A change whose
   * `rows` is the current array records no undo step but is still reported.
   */
  commit: (change: RowChange) => void;
  /** Steps back one person write; false when there is none. Reported to `onUserEdit`. */
  undo: () => boolean;
  /** Re-applies the last undone write; false when there is none. Reported to `onUserEdit`. */
  redo: () => boolean;
  /** Inserts an empty row at the top. */
  addRow: () => void;
  /**
   * Programmatic access for agent tools and file import (`onReady`), the
   * same behaviour as `memoryGridApi`. Writes through it are not reported to
   * `onUserEdit` (the caller already knows what it changed) and are not
   * undoable: a write that changes rows empties the undo and redo history.
   */
  api: GridApi;
  /** Removes the ticked rows. */
  deleteSelected: () => void;
  /** Removes every row; saved ones are sent as deletes on the next save. */
  clearAll: () => void;
  /**
   * A person's edit of one cell. Returns false, and does nothing, when the
   * value is unchanged (blank equals blank).
   */
  editCell: (pos: CellPos, value: string) => boolean;
  /**
   * A person's Delete/Backspace over a block: empties its editable,
   * non-blank cells. Nothing touched, nothing reported.
   */
  clearCells: (
    cells: ReadonlyArray<ReadonlyArray<CellPos>>,
    columns: ReadonlyArray<WritableColumn>,
  ) => void;
  save: () => Promise<void>;
}

export function useDataGrid(opts: {
  data: ReadonlyArray<Record<string, unknown>>;
  onSave: (payload: SavePayload) => Promise<GridSaveResponse>;
  normalizeRow?: (row: Record<string, unknown>) => Record<string, unknown>;
  onUserEdit?: (rowIds: Array<string>) => void;
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
  // Earlier states of `rows`, newest last. Rows are immutable, so a state is
  // an array reference: a step costs one array of pointers, never a clone.
  const history = {
    undo: [] as Array<ReadonlyArray<Row>>,
    redo: [] as Array<ReadonlyArray<Row>>,
  };

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

  function commit({ rows: next, touchedIds }: RowChange) {
    if (next !== rows.value) {
      const touched = new Set(touchedIds);
      history.undo.push(rows.value);
      history.redo = [];
      replace(next.map((row) => (touched.has(row.id) ? normalized(row) : row)));
    }
    opts.onUserEdit?.(touchedIds);
  }

  /** Moves one state from `from` to the current rows, keeping the current one in `to`. */
  function travel(
    from: Array<ReadonlyArray<Row>>,
    to: Array<ReadonlyArray<Row>>,
  ): boolean {
    const target = from.pop();
    if (!target) {
      return false;
    }
    to.push(rows.value);
    const ids = changedIds(rows.value, target);
    replace(target);
    opts.onUserEdit?.(ids);
    return true;
  }

  /** An agent's write: not undoable, and the history before it no longer applies. */
  function agentWrite(next: ReadonlyArray<Row>) {
    if (next !== rows.value) {
      history.undo = [];
      history.redo = [];
      replace(next);
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

  function addRows(added: ReadonlyArray<Record<string, unknown>>) {
    const change = appendRows(rows.value, added);
    const fresh = new Set(change.touchedIds);
    agentWrite(
      change.rows.map((row) => (fresh.has(row.id) ? normalized(row) : row)),
    );
    return change.touchedIds;
  }

  /** Merges each patch into its row, in order, through `normalizeRow`. */
  function updateRows(
    patches: ReadonlyArray<{ id: string } & Record<string, unknown>>,
  ): { updated: Array<string>; missing: Array<string> } {
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
    addRows: async (added) => addRows(added),
    updateRows: async (patches) => updateRows(patches),
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
    const change = writeCells(
      rows.value,
      new Map([[pos.rowId, { [pos.colId]: value }]]),
    );
    if (change.touchedIds.length === 0) {
      return false;
    }
    commit(change);
    return true;
  }

  function clearCells(
    cells: ReadonlyArray<ReadonlyArray<CellPos>>,
    columns: ReadonlyArray<WritableColumn>,
  ) {
    const change = clearCellsIn(rows.value, cells, columns);
    if (change.touchedIds.length > 0) {
      commit(change);
    }
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
    commit,
    undo: () => travel(history.undo, history.redo),
    redo: () => travel(history.redo, history.undo),
    addRow,
    api,
    deleteSelected,
    clearAll,
    editCell,
    clearCells,
    save,
  };
}
