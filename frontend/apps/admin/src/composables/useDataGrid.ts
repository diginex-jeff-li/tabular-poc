import { useEventListener } from '@vueuse/core';
import { clearCells as clearCellsIn } from 'utils/gridClear';
import { buildSavePayload, diffRows } from 'utils/gridDiff';
import { computed, readonly, ref, shallowRef, watch } from 'vue';
import type {
  GridSaveError,
  GridSaveResponse,
} from 'composables/useGridEditor';
import type { SavePayload } from 'utils/gridDiff';
import type { CellPos } from 'utils/gridRange';
import type { GridColumn } from 'utils/zodToColumnDefs';
import type { ComputedRef, Ref, ShallowRef } from 'vue';

/** A grid row. Rows are never mutated; every change replaces the row and the array. */
export type Row = Record<string, unknown> & { id: string };

/** Ticked rows by row id (TanStack's `RowSelectionState` shape). */
export type RowSelection = Record<string, boolean>;

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
  /** Inserts an empty row at the top. */
  addRow: () => void;
  /**
   * Appends rows, each with a fresh id and through `normalizeRow`, and
   * returns their ids. Not reported to `onUserEdit`: a paste reports them,
   * an agent write does not.
   */
  addRows: (rows: ReadonlyArray<Record<string, unknown>>) => Array<string>;
  /** Removes the ticked rows. */
  deleteSelected: () => void;
  /** Removes every row; saved ones are sent as deletes on the next save. */
  clearAll: () => void;
  /**
   * A person's edit of one cell: the row is rebuilt through `normalizeRow`,
   * replaced, and reported to `onUserEdit`. Returns false, and does nothing,
   * when the value is unchanged (blank equals blank).
   */
  editCell: (pos: CellPos, value: string) => boolean;
  /**
   * A person's Delete/Backspace over a block: empties its editable,
   * non-blank cells, rebuilds each touched row through `normalizeRow`, and
   * reports the touched rows to `onUserEdit` once. Nothing touched, nothing
   * reported.
   */
  clearCells: (
    cells: ReadonlyArray<ReadonlyArray<CellPos>>,
    columns: ReadonlyArray<GridColumn>,
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

  function setRowSelected(rowId: string, selected: boolean) {
    const { [rowId]: _, ...rest } = rowSelection.value;
    rowSelection.value = selected ? { ...rest, [rowId]: true } : rest;
  }

  function addRow() {
    const row: Row = { id: crypto.randomUUID() };
    rows.value = [row, ...rows.value];
    opts.onUserEdit?.([row.id]);
  }

  function addRows(added: ReadonlyArray<Record<string, unknown>>) {
    const fresh = added.map((row) =>
      normalized({ ...row, id: crypto.randomUUID() }),
    );
    rows.value = [...rows.value, ...fresh];
    return fresh.map((row) => row.id);
  }

  function deleteSelected() {
    const ids = rows.value
      .filter((row) => rowSelection.value[row.id])
      .map((row) => row.id);
    const gone = new Set(ids);
    if (gone.size > 0) {
      rows.value = rows.value.filter((row) => !gone.has(row.id));
      rowSelection.value = {};
      errorList.value = errorList.value.filter((err) => !gone.has(err.rowId));
    }
    opts.onUserEdit?.(ids);
  }

  function clearAll() {
    rows.value = [];
    rowSelection.value = {};
    errorList.value = [];
    saveResult.value = null;
    opts.onUserEdit?.([]);
  }

  function editCell(pos: CellPos, value: string): boolean {
    const row = rows.value.find((r) => r.id === pos.rowId);
    if (!row || sameValue(row[pos.colId], value)) {
      return false;
    }
    const next = normalized({ ...row, [pos.colId]: value });
    rows.value = rows.value.map((r) => (r === row ? next : r));
    opts.onUserEdit?.([row.id]);
    return true;
  }

  function clearCells(
    cells: ReadonlyArray<ReadonlyArray<CellPos>>,
    columns: ReadonlyArray<GridColumn>,
  ) {
    const cleared = clearCellsIn(rows.value, cells, columns);
    if (cleared.touchedIds.length === 0) {
      return;
    }
    const touched = new Set(cleared.touchedIds);
    rows.value = cleared.rows.map((row) =>
      touched.has(row.id) ? normalized(row) : row,
    );
    opts.onUserEdit?.(cleared.touchedIds);
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
    addRow,
    addRows,
    deleteSelected,
    clearAll,
    editCell,
    clearCells,
    save,
  };
}

function sameValue(before: unknown, after: string): boolean {
  const blank = before === null || before === undefined || before === '';
  return blank ? after === '' : before === after;
}
