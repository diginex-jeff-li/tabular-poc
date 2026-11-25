import { useEventListener } from '@vueuse/core';
import { useDirtyTracking } from 'composables/useDirtyTracking';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
/**
 * useGridEditor — the shared grid engine's behaviour.
 *
 * Owns the Tabulator instance and its lifecycle, clipboard paste parsing,
 * dirty tracking delegation, the save loop, error highlighting (by rowId),
 * scroll-to-error, add row / delete selected / clear / export CSV, and the
 * beforeunload guard (via VueUse useEventListener).
 *
 * Extracted verbatim from ComplianceGridEditor.tsx (feature a3). The page
 * keeps its render function; only behaviour moves here.
 *
 * CRITICAL: error highlighting resolves rows by `rowId`, never by the
 * upserts-array index — commit f7bd853 fixed that bug; do not reintroduce it.
 */
import { ref, shallowRef, watch } from 'vue';
import type { ColumnDefinition, Options } from 'tabulator-tables';
import type { Ref } from 'vue';

// ── Shared save types (match contracts BulkSaveError/Response shape) ──

export interface GridSaveError {
  row: number;
  rowId: string;
  field: string;
  message: string;
}

export interface GridSaveResponse {
  errors: Array<GridSaveError>;
  saved: number;
}

/** Programmatic grid access for agent tools and file import. Rows by `id`. */
export interface GridApi {
  getRows(): Array<Record<string, unknown>>;
  addRows(rows: Array<Record<string, unknown>>): Promise<Array<string>>;
  updateRows(
    patches: Array<{ id: string } & Record<string, unknown>>,
  ): Promise<{ updated: Array<string>; missing: Array<string> }>;
  deleteRows(ids: Array<string>): {
    deleted: Array<string>;
    missing: Array<string>;
  };
  showErrors(errors: Array<GridSaveError>): void;
}

// ── Clipboard paste parser (pure, exported for unit testing) ──
//
// Splits on \n then \t and maps cells positionally against the data columns,
// which are derived by filtering `columns` for
// `c.clipboard !== false && c.visible !== false`. Extra pasted columns are
// dropped; missing ones are left undefined. Never assume the checkbox column
// is at index 0 — filter by the flag, not by position or field name.

export function parseClipboardPaste(
  clipboard: string,
  columns: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const dataColumns = columns.filter(
    (c) => c.clipboard !== false && c.visible !== false,
  );
  const rows = clipboard.split('\n').filter((r) => r.trim());
  return rows.map((row) => {
    const cells = row.split('\t');
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < cells.length && i < dataColumns.length; i++) {
      obj[dataColumns[i].field as string] = cells[i];
    }
    return obj;
  });
}

// ── Composable ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTabulator = any;

interface UseGridEditorOptions {
  tableEl: Ref<HTMLElement | null>;
  columns: Ref<Array<Record<string, unknown>>>;
  data: Ref<Array<Record<string, unknown>>>;
  onSave: (payload: {
    upserts: Array<Record<string, unknown>>;
    deletes: Array<string>;
  }) => Promise<GridSaveResponse>;
  exportFilename: Ref<string> | string;
  /** Applied to every row that enters or is edited in the grid. */
  normalizeRow?: (row: Record<string, unknown>) => Record<string, unknown>;
  /** Called with row ids after a person adds, pastes, edits or deletes rows. */
  onUserEdit?: (rowIds: Array<string>) => void;
  /**
   * Replaces the positional paste parser; call `positional()` for the
   * default. Return [] to insert nothing (e.g. to hold the paste elsewhere).
   */
  pasteParser?: (
    clipboard: string,
    positional: () => Array<Record<string, unknown>>,
  ) => Array<Record<string, unknown>>;
}

export function useGridEditor(opts: UseGridEditorOptions) {
  const { tableEl, columns, data, onSave, exportFilename, onUserEdit } = opts;
  const normalize = opts.normalizeRow ?? ((row) => row);

  // The tabulator shallowRef must be created BEFORE useDirtyTracking is
  // called — useDirtyTracking wires its events via watch(..., immediate: true)
  // and needs the ref to exist so it can observe when the instance is set.
  const tabulator = shallowRef<Tabulator | null>(null);
  const isSaving = ref(false);
  const saveResult = ref<GridSaveResponse | null>(null);
  const errorList = ref<Array<GridSaveError>>([]);
  const rowCount = ref(0);

  // Dirty tracking — delegates to the existing composable. The tabulator ref
  // exists (null initially); the watch inside useDirtyTracking fires with
  // immediate: true and will re-fire when tabulator.value is set on mount.
  const { dirtyCount, markDirty, markDeleted, buildSavePayload, clearDirty } =
    useDirtyTracking(tabulator);

  // ── beforeunload guard: warn on navigation with unsaved changes ──
  // VueUse useEventListener auto-cleans on unmount — no manual add/remove.
  useEventListener(window, 'beforeunload', (e: BeforeUnloadEvent) => {
    if (dirtyCount.value > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ── Init Tabulator when the host element appears ──
  // A watch (immediate) covers both the mounted case (tableEl set by Vue
  // after the DOM renders) and the in-test case (tableEl set synchronously).
  // This keeps the composable testable without a component mount.
  watch(
    () => tableEl.value,
    (el, _prev, onCleanup) => {
      if (!el) {
        return;
      }

      const tabOpts = {
        data: data.value,
        reactiveData: true,
        // Column defs travel as plain records (pages build them from Zod);
        // typing the GridEditor `columns` prop end to end would remove this.
        columns: columns.value as unknown as Array<ColumnDefinition>,
        clipboard: true,
        clipboardPasteParser: (clipboard: string) => {
          const positional = () =>
            parseClipboardPaste(clipboard, columns.value);
          const rows = opts.pasteParser
            ? opts.pasteParser(clipboard, positional)
            : positional();
          return rows.map(normalize);
        },
        clipboardPasteAction: 'insert',
        clipboardCopyConfig: { columnHeaders: false },
        validationMode: 'highlight',
        height: '100%',
        layout: 'fitDataFill',
        movableColumns: false,
        autoColumns: false,
        selectable: true,
        headerSortClickElement: 'icon',
      } as Options;

      const tab = new Tabulator(el, tabOpts);
      tabulator.value = tab;
      rowCount.value = tab.getDataCount();

      // Track row count changes
      tab.on('dataProcessed', () => {
        rowCount.value = tab.getDataCount();
      });

      // After paste, add UUIDs to rows lacking one and mark only NEW rows dirty.
      const onClipboardPasted = () => {
        const current = tab.getData();
        let needsUpdate = false;
        const updated = current.map((row: Record<string, unknown>) => {
          if (!row.id) {
            needsUpdate = true;
            return { ...row, id: crypto.randomUUID() };
          }
          return row;
        });
        if (needsUpdate) {
          void tab.replaceData(updated);
        }
        // Only mark rows that got a new UUID (were newly pasted)
        const pastedIds: Array<string> = [];
        for (const row of updated) {
          if (
            row.id &&
            !current.some((r: Record<string, unknown>) => r.id === row.id)
          ) {
            markDirty(row.id as string, 'added');
            pastedIds.push(row.id as string);
          }
        }
        // VAL-CUSTOM-005: Tabulator only runs column validators on cell edit
        // events, not on data load or paste. Explicitly validate every row
        // so that cells carrying a value a column's 'in' (or 'required')
        // validator rejects get the .tabulator-validation-fail highlight.
        // validationMode is 'highlight' (not 'manual'), so row.validate()
        // adds the class to failing cells. This is required by the custom-
        // table contract; the compliance grid's enum validator is
        // programmatic-only (GRID-007), but custom tables require the
        // in-cell highlight on paste.
        const rowsToValidate = tab.getRows();
        for (const row of rowsToValidate) {
          // row.validate() is a Tabulator RowComponent method that runs
          // each cell's validators and adds .tabulator-validation-fail to
          // failing cells. It returns true or an array of invalid cells.
          if (typeof row.validate === 'function') {
            row.validate();
          }
        }
        rowCount.value = tab.getDataCount();
        onUserEdit?.(pastedIds);
      };
      tab.on('clipboardPasted', onClipboardPasted);

      // A person's cell edit is a way in too: normalize the whole row.
      const onCellEdited = (cell: AnyTabulator) => {
        const row = cell.getRow();
        const before = row.getData() as Record<string, unknown>;
        const after = normalize(before);
        if (JSON.stringify(after) !== JSON.stringify(before)) {
          row.update(after);
        }
        onUserEdit?.([String(before.id)]);
      };
      tab.on('cellEdited', onCellEdited);

      onCleanup(() => {
        tab.off('dataProcessed');
        tab.off('clipboardPasted', onClipboardPasted);
        tab.off('cellEdited', onCellEdited);
      });
    },
    { immediate: true },
  );

  // ── Add Row ──
  function handleAddRow() {
    if (!tabulator.value) {
      return;
    }
    const newRow = { id: crypto.randomUUID() };
    const added = tabulator.value.addRow(newRow, true);
    markDirty(newRow.id, 'added');
    rowCount.value = tabulator.value.getDataCount();
    void Promise.resolve(added).then(() => onUserEdit?.([newRow.id]));
  }

  // ── Export CSV ──
  // VAL-GRID-022: pass 'all' as the row range (4th arg) so the export includes
  // every row regardless of active column filters. Tabulator's default range
  // is 'active', which honours filters and would omit filtered-out rows.
  function handleExportCSV() {
    if (!tabulator.value) {
      return;
    }
    const filename =
      typeof exportFilename === 'object' && 'value' in exportFilename
        ? exportFilename.value
        : exportFilename;
    tabulator.value.download('csv', filename, { delimiter: ',' }, 'all');
  }

  // ── Error highlighting ──
  // Locate rows by rowId (regression guard for f7bd853), never by array index.
  function applyErrorHighlights(errors: Array<GridSaveError>) {
    if (!tabulator.value) {
      return;
    }
    clearErrorHighlights();
    const rows = tabulator.value.getRows();
    for (const err of errors) {
      const row = rows.find(
        (r: { getData: () => Record<string, unknown> }) =>
          r.getData().id === err.rowId,
      );
      if (!row) {
        continue;
      }
      const cell = row.getCell(err.field);
      if (!cell) {
        continue;
      }
      const el = cell.getElement();
      el.classList.add('backend-validation-error');
    }
  }

  function clearErrorHighlights() {
    if (!tabulator.value) {
      return;
    }
    const cells = tabulator.value.element?.querySelectorAll(
      '.backend-validation-error',
    );
    if (cells) {
      cells.forEach((c: Element) =>
        c.classList.remove('backend-validation-error'),
      );
    }
  }

  // ── Save loop ──
  async function handleSave() {
    if (!tabulator.value || isSaving.value) {
      return;
    }
    isSaving.value = true;
    errorList.value = [];
    saveResult.value = null;

    const payload = buildSavePayload();

    if (payload.upserts.length === 0 && payload.deletes.length === 0) {
      isSaving.value = false;
      saveResult.value = { errors: [], saved: 0 };
      return;
    }

    try {
      const result = await onSave(payload);
      saveResult.value = result;

      if (result.errors.length > 0) {
        errorList.value = result.errors;
        applyErrorHighlights(result.errors);
      } else {
        clearDirty();
        clearErrorHighlights();
      }
    } catch {
      saveResult.value = {
        errors: [
          { row: 0, rowId: '', field: 'network', message: 'Save failed' },
        ],
        saved: 0,
      };
    } finally {
      isSaving.value = false;
    }
  }

  // ── Scroll to error ──
  function scrollToError(err: GridSaveError) {
    if (!tabulator.value) {
      return;
    }
    const rows = tabulator.value.getRows();
    const row = rows.find(
      (r: { getData: () => Record<string, unknown> }) =>
        r.getData().id === err.rowId,
    );
    if (row) {
      void row.scrollTo();
      const cell = row.getCell(err.field);
      if (cell) {
        const el = cell.getElement();
        el.style.outline = '3px solid #ef4444';
        setTimeout(() => {
          el.style.outline = '';
        }, 2000);
      }
    }
  }

  // ── VAL-GRID-029: clear the "Saved N" badge when a new change occurs ──
  // The save loop only resets saveResult at the start of handleSave, so the
  // success badge would persist after edits made post-save. Watching
  // dirtyCount clears the badge the moment a new edit/add/delete makes the
  // grid dirty again, so the dirty-count chip reappears in its place.
  watch(dirtyCount, (count) => {
    if (count > 0 && saveResult.value !== null) {
      saveResult.value = null;
    }
  });

  // ── Clear grid ──
  // VAL-CUSTOM-040 / VAL-GRID-023: clearing the grid empties the visible
  // data, clears error highlights and the error sidebar, and resets the
  // save result — but it does NOT clear the dirty map. Instead it marks
  // every existing (currently displayed) row as 'deleted' so that:
  //   1. dirtyCount stays > 0, keeping the Save button enabled;
  //   2. buildSavePayload includes all the cleared row ids in `deletes`;
  //   3. a subsequent save writes an empty array to the table's stored row
  //      data (the save handler applies the deletes and persists []).
  // Rows that were only ever 'added' (never saved) are dropped from the
  // dirty map by markDeleted (matching its existing semantics) since they
  // were never persisted and need no delete sent to the backend.
  function clearGrid() {
    if (tabulator.value) {
      const currentData = tabulator.value.getData() as Array<
        Record<string, unknown>
      >;
      for (const row of currentData) {
        const rowId = row.id as string | undefined;
        if (rowId) {
          markDeleted(rowId);
        }
      }
    }
    tabulator.value?.clearData();
    clearErrorHighlights();
    errorList.value = [];
    saveResult.value = null;
    rowCount.value = 0;
    onUserEdit?.([]);
  }

  // ── Delete selected ──
  // VAL-CUSTOM-018: after deleting rows, filter errorList to remove entries
  // whose rowId matches any of the deleted row ids. Without this the error
  // sidebar would keep showing entries for rows that no longer exist in the
  // grid, and the toolbar error chip would over-count.
  function handleDeleteSelected() {
    if (!tabulator.value) {
      return;
    }
    const selectedRows = tabulator.value.getSelectedRows();
    const deletedRowIds = new Set<string>();
    for (const row of selectedRows) {
      const rowData = row.getData();
      const rowId = rowData.id as string;
      markDeleted(rowId);
      deletedRowIds.add(rowId);
      void row.delete();
    }
    if (deletedRowIds.size > 0 && errorList.value.length > 0) {
      errorList.value = errorList.value.filter(
        (err) => !deletedRowIds.has(err.rowId),
      );
    }
    rowCount.value = tabulator.value.getDataCount();
    onUserEdit?.([...deletedRowIds]);
  }

  // ── Programmatic API (agent tools, file import) ──
  // Every mutation goes through dirty tracking so Save sees it, rows are
  // addressed by `id` (never by position), and touched rows are validated so
  // the in-cell highlight matches what a human edit would show.
  function getRows(): Array<Record<string, unknown>> {
    return (tabulator.value?.getData() ?? []) as Array<Record<string, unknown>>;
  }

  async function addRows(
    rows: Array<Record<string, unknown>>,
  ): Promise<Array<string>> {
    const tab = tabulator.value;
    if (!tab) {
      return [];
    }
    const withIds = rows.map((r) => ({
      ...normalize(r),
      id: crypto.randomUUID(),
    }));
    const added = await tab.addData(withIds);
    for (const row of withIds) {
      markDirty(row.id, 'added');
    }
    for (const row of added ?? []) {
      row.validate?.();
    }
    rowCount.value = tab.getDataCount();
    return withIds.map((r) => r.id);
  }

  async function updateRows(
    patches: Array<{ id: string } & Record<string, unknown>>,
  ): Promise<{ updated: Array<string>; missing: Array<string> }> {
    const tab = tabulator.value;
    const result = {
      updated: [] as Array<string>,
      missing: [] as Array<string>,
    };
    if (!tab) {
      return result;
    }
    for (const { id, ...fields } of patches) {
      const row = tab.getRow(id);
      if (!row) {
        result.missing.push(id);
        continue;
      }
      await row.update(
        normalize({
          ...(row.getData() as Record<string, unknown>),
          ...fields,
        }),
      );
      markDirty(id, 'modified');
      row.validate?.();
      result.updated.push(id);
    }
    return result;
  }

  function deleteRows(ids: Array<string>): {
    deleted: Array<string>;
    missing: Array<string>;
  } {
    const tab = tabulator.value;
    const result = {
      deleted: [] as Array<string>,
      missing: [] as Array<string>,
    };
    if (!tab) {
      return result;
    }
    for (const id of ids) {
      const row = tab.getRow(id);
      if (!row) {
        result.missing.push(id);
        continue;
      }
      markDeleted(id);
      void row.delete();
      result.deleted.push(id);
    }
    errorList.value = errorList.value.filter(
      (e) => !result.deleted.includes(e.rowId),
    );
    rowCount.value = tab.getDataCount();
    return result;
  }

  // Re-run formatters first (they may show per-row state such as a status
  // column), then paint the error cells on the fresh DOM. Reformatting
  // rebuilds a row's cells, so skip a row a person is editing right now.
  function showErrors(errors: Array<GridSaveError>) {
    errorList.value = errors;
    for (const row of tabulator.value?.getRows() ?? []) {
      if (!row.getElement()?.querySelector('.tabulator-editing')) {
        row.reformat();
      }
    }
    if (errors.length > 0) {
      applyErrorHighlights(errors);
    } else {
      clearErrorHighlights();
    }
  }

  return {
    tabulator,
    rowCount,
    dirtyCount,
    isSaving,
    errorList,
    saveResult,
    handleAddRow,
    handleSave,
    handleDeleteSelected,
    handleExportCSV,
    clearGrid,
    scrollToError,
    getRows,
    addRows,
    updateRows,
    deleteRows,
    showErrors,
  };
}
