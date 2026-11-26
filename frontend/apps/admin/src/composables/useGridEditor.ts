import { useEventListener } from '@vueuse/core';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
/**
 * useGridEditor — the Tabulator engine's behaviour (comparison-only).
 *
 * Owns the Tabulator instance and its lifecycle, paste (append or over the
 * selection), the derived dirty diff, the save loop, undo/redo, error
 * highlighting (by rowId), scroll-to-error, add row / delete selected /
 * clear / export CSV, column visibility, and the beforeunload guard.
 *
 * Tabulator edits its row objects in place, so `rows` is re-read from it on
 * every data change and every stored state (save snapshot, undo history) is
 * a copy. Dirty state is `diffRows(snapshot, rows)`, as in `useDataGrid`.
 *
 * A person's write is one `personWrite`: it runs, then `commit` records one
 * undo step and calls `onUserEdit` once. Tabulator's own `history` module is
 * not used: it records `normalizeRow`'s follow-up writes as separate steps,
 * keeps no step for Clear (`clearData` wipes it), and its undo skips
 * `cellEdited`, so undone rows would never reach `onUserEdit`.
 *
 * CRITICAL: error highlighting resolves rows by `rowId`, never by the
 * upserts-array index — commit f7bd853 fixed that bug; do not reintroduce it.
 */
import { buildSavePayload, diffRows } from 'utils/gridDiff';
import { overwritePaste } from 'utils/gridPaste';
import { computed, ref, shallowRef, watch } from 'vue';
import type { ColumnVisibilityItem } from 'components/ColumnVisibilityMenu';
import type { Row } from 'composables/useDataGrid';
import type {
  CellComponent,
  ColumnComponent,
  ColumnDefinition,
  Options,
  RangeComponent,
  RowComponent,
} from 'tabulator-tables';
import type { GridSaveError, GridSaveResponse } from 'utils/gridApi';
import type { CellPos, GridOrder } from 'utils/gridRange';
import type { WritableColumn } from 'utils/gridWrite';
import type { Ref } from 'vue';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTabulator = any;

type Rows = ReadonlyArray<Row>;

/** A range after the fill handle wrote it (`rangeEdited`). */
interface EditedRange {
  getModifiedCells(): Array<CellComponent>;
}

/** The `rangeEdited` event, which the published Tabulator types lack. */
interface RangeEvents {
  on(event: 'rangeEdited', handler: (range: EditedRange) => void): void;
  off(event: 'rangeEdited', handler: (range: EditedRange) => void): void;
}

/** A column a person can type into: it has an editor that isn't switched off. */
function isEditable(def: { editor?: unknown; editable?: unknown }): boolean {
  return Boolean(def.editor) && def.editable !== false;
}

// ── Delete/Backspace on a range selection ──
//
// Clears the selected cells a person could have typed into (`isEditable`).
// Tabulator's own `selectableRangeClearCells` writes to every cell in the
// range, read-only ones (Status, __select) included, which leaks junk fields
// into the row. Each clear is a `setValue`, so it fires `cellEdited` like a
// typed edit. That edit may re-render the row (normalizeRow → row.update),
// which deletes the row's cell objects, so targets are kept as (row, field)
// and each cell is looked up again just before it is cleared. `setValue`
// skips column validators, so each touched row is validated afterwards to
// get the same highlight a typed clear would. Returns how many cells were
// cleared.
export function clearRangeCells(tab: AnyTabulator): number {
  const ranges: Array<RangeComponent> = tab.getRanges?.() ?? [];
  const targets: Array<{ row: RowComponent; field: string }> = [];
  for (const range of ranges) {
    for (const cell of range.getCells().flat()) {
      const def = cell.getColumn().getDefinition();
      const value: unknown = cell.getValue();
      if (!isEditable(def)) {
        continue;
      }
      if (value === null || value === undefined || value === '') {
        continue;
      }
      targets.push({ row: cell.getRow(), field: String(def.field) });
    }
  }
  const rows = new Set<RowComponent>();
  for (const { row, field } of targets) {
    row.getCell(field).setValue(null);
    rows.add(row);
  }
  for (const row of rows) {
    row.validate();
  }
  return targets.length;
}

// ── Tabulator as grid data ──

/** Copies of the rows: Tabulator edits its own row objects in place. */
function copyRows(rows: ReadonlyArray<Record<string, unknown>>): Array<Row> {
  return rows.map((row) => ({ ...row }) as Row);
}

/** Ids of the rows added, changed or removed between two states. */
function changedIds(before: Rows, after: Rows): Array<string> {
  const diff = diffRows(before, after);
  return [...diff.added, ...diff.modified]
    .map((row) => row.id)
    .concat(diff.deleted);
}

function visibleColumns(tab: Tabulator): Array<ColumnComponent> {
  return tab
    .getColumns()
    .filter((column) => column.isVisible() && column.getField());
}

/** What the grid shows, in screen order: filtered and sorted rows, visible columns. */
function gridOrder(tab: Tabulator): GridOrder {
  return {
    rowIds: tab.getRows('active').map((row) => rowId(row)),
    colIds: visibleColumns(tab).map((column) => column.getField()),
  };
}

function writableColumns(tab: Tabulator): Array<WritableColumn> {
  return visibleColumns(tab).map((column) => ({
    id: column.getField(),
    editor: isEditable(column.getDefinition()) ? 'text' : null,
  }));
}

function rowId(row: RowComponent): string {
  return String((row.getData() as Row).id);
}

function activeCell(tab: Tabulator): CellComponent | undefined {
  return tab.getRanges().at(-1)?.getStructuredCells()[0]?.[0];
}

/** The active range's top-left cell, or null when no cell is selected. */
function rangeOrigin(tab: Tabulator): CellPos | null {
  const cell = activeCell(tab);
  return cell ? { rowId: rowId(cell.getRow()), colId: cell.getField() } : null;
}

/**
 * Remembers the active cell's row, place among the rows shown, and column.
 * The returned function, run once rows were removed or reloaded, puts the
 * active cell back on that row, or at the same place (clamped) when the row
 * is gone, as DataGrid's selection does. Tabulator's range would otherwise
 * keep pointing at rows that no longer exist.
 */
function holdActiveCell(tab: Tabulator): (reloaded: boolean) => void {
  const cell = activeCell(tab);
  if (!cell) {
    return () => {};
  }
  const id = rowId(cell.getRow());
  const field = cell.getField();
  const index = tab.getRows('active').findIndex((row) => rowId(row) === id);
  return (reloaded) => {
    const rows = tab.getRows('active');
    const same = rows.find((row) => rowId(row) === id);
    if (same && !reloaded) {
      return;
    }
    clearRanges(tab);
    const row = same ?? rows[Math.min(index, rows.length - 1)];
    if (row) {
      const target = row.getCell(field);
      tab.addRange(target, target);
    }
  };
}

/** Drops every range, so nothing is selected and the next paste appends. */
function clearRanges(tab: Tabulator) {
  for (const range of tab.getRanges()) {
    range.remove();
  }
}

/** Runs each listed row's validators, for the in-cell highlight. */
function validateRows(tab: Tabulator, ids: ReadonlyArray<string>) {
  const wanted = new Set(ids);
  for (const row of tab.getRows()) {
    if (wanted.has(rowId(row))) {
      row.validate();
    }
  }
}

/**
 * Makes Tabulator hold `target`: changed rows are updated in place when the
 * same rows remain; otherwise the data is replaced and row ticks restored.
 * Returns whether the data was replaced (every row object is new).
 */
async function writeRows(tab: Tabulator, target: Rows): Promise<boolean> {
  const live = tab.getData() as Rows;
  const liveById = new Map(live.map((row) => [row.id, row]));
  if (
    live.length === target.length &&
    target.every((row) => liveById.has(row.id))
  ) {
    const changed = new Set(changedIds(live, target));
    for (const row of target) {
      const from = liveById.get(row.id);
      if (from && changed.has(row.id)) {
        const keys = new Set([...Object.keys(from), ...Object.keys(row)]);
        await tab
          .getRow(row.id)
          .update(Object.fromEntries([...keys].map((k) => [k, row[k]])));
      }
    }
    return false;
  }
  const kept = new Set(target.map((row) => row.id));
  const ticked = (tab.getSelectedData() as Rows).flatMap((row) =>
    kept.has(row.id) ? [row.id] : [],
  );
  await tab.replaceData(copyRows(target));
  if (ticked.length > 0) {
    tab.selectRow(ticked);
  }
  return true;
}

/** The parts of Tabulator's internal fill handle `fillRowsOnly` touches. */
interface FillHandle {
  source: { right: number };
  handleCellMouseMove: (
    e: MouseEvent,
    cell: { row: unknown; column: { getPosition(): number } },
  ) => void;
}

/**
 * The fill handle grows a range down or up only, as DataGrid's does. Tabulator
 * grows it along whichever axis the pointer strayed further, with no option
 * to limit it, so the pointer's column is pinned to the source's right edge.
 */
function fillRowsOnly(tab: Tabulator) {
  // Internal module state; no public API exposes the fill handle.
  const internals = tab as unknown as {
    modules?: { selectRange?: { fillHandle?: FillHandle } };
  };
  const handle = internals.modules?.selectRange?.fillHandle;
  if (!handle) {
    return;
  }
  const track = handle.handleCellMouseMove;
  handle.handleCellMouseMove = (e, cell) =>
    track(e, {
      row: cell.row,
      column: { getPosition: () => handle.source.right + 1 },
    });
}

/**
 * Frozen columns (invite Status) can't move; the checkbox column is put back
 * right after them when a drag lands a column before it.
 */
function keepCheckboxFirst(tab: Tabulator) {
  const columns = tab.getColumns();
  const select = columns.find((column) => column.getField() === '__select');
  const first = columns.find((column) => !column.getDefinition().frozen);
  if (select && first && first !== select) {
    tab.moveColumn(select, first, false);
  }
}

/** Keys typed into a control keep their own meaning. */
function fromControl(target: EventTarget | null): boolean {
  return Boolean(
    (target as HTMLElement | null)?.closest?.(
      'input, textarea, select, [contenteditable="true"], [role="combobox"]',
    ),
  );
}

/** ⌘/Ctrl+Z undoes; ⌘/Ctrl+Shift+Z and Ctrl+Y redo. */
function historyStep(e: KeyboardEvent): 'undo' | 'redo' | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) {
    return null;
  }
  const key = e.key.toLowerCase();
  if (key === 'z') {
    return e.shiftKey ? 'redo' : 'undo';
  }
  return key === 'y' && e.ctrlKey && !e.shiftKey ? 'redo' : null;
}

function tabulatorOptions(
  data: Array<Row>,
  columns: Array<Record<string, unknown>>,
): Options {
  return {
    data,
    reactiveData: true,
    // Column defs travel as plain records (pages build them from Zod);
    // typing the GridEditor `columns` prop end to end would remove this.
    columns: columns as unknown as Array<ColumnDefinition>,
    // Copy only: paste is ours (`onPaste`), so it can write over a selection.
    clipboard: 'copy',
    clipboardCopyConfig: { columnHeaders: false },
    // Copy the selected cells, not the whole table.
    clipboardCopyRowRange: 'range',
    validationMode: 'highlight',
    height: '100%',
    layout: 'fitDataFill',
    movableColumns: true,
    autoColumns: false,
    // Rows are selected by the __select checkboxes only. Explicitly
    // `undefined` (Tabulator issue #4847): `true` adds click-to-select on
    // the whole row, so every cell click also toggles the row; `false`, or
    // the "highlight" default with range selection on, breaks the
    // checkboxes (one row at a time / none).
    selectableRows: undefined,
    // Spreadsheet behaviour: an active cell, arrow/Tab moves, drag or
    // Shift+click a block, click a row or column header to take it all.
    // Delete/Backspace clearing is ours (clearRangeCells), not Tabulator's
    // selectableRangeClearCells, which also writes to read-only columns.
    selectableRange: true,
    selectableRangeColumns: true,
    selectableRangeRows: true,
    // No cell is selected until a person picks one, so a paste appends.
    selectableRangeInitializeDefault: false,
    selectableRangeFill: true,
    // Enter or double-click edits; arrows navigate instead of opening editors.
    editTriggerEvent: 'dblclick',
    // Sorting is on the header icon so a header click can select the column.
    headerSortClickElement: 'icon',
  } as Options;
}

/** Menu entries: every column a person sees, except the checkbox column. */
function columnMenuItems(
  columns: Array<Record<string, unknown>>,
): Array<ColumnVisibilityItem> {
  return columns.flatMap((def) =>
    def.field !== '__select' && def.title && def.visible !== false
      ? [
          {
            id: String(def.field),
            title: String(def.title),
            visible: true,
            locked: def.frozen === true,
          },
        ]
      : [],
  );
}

// ── Composable ──

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

  const tabulator = shallowRef<Tabulator | null>(null);
  const isSaving = ref(false);
  const saveResult = ref<GridSaveResponse | null>(null);
  const errorList = ref<Array<GridSaveError>>([]);
  // Bumped after every Tabulator render (sort, filter, data change), so
  // `rowNumber` is re-read when a row's place on screen can have moved.
  const renderTick = ref(0);
  function onRenderComplete() {
    renderTick.value += 1;
  }

  // ── Rows and the derived dirty diff ──
  const initial: Array<Row> = data.value.map((row) =>
    typeof row.id === 'string' && row.id !== ''
      ? (row as Row)
      : { ...row, id: crypto.randomUUID() },
  );
  // Tabulator's live row objects, re-read on every data change.
  const rows = shallowRef<Rows>(initial);
  // The rows at load and as sent by the last successful save.
  const snapshot = shallowRef<Rows>(copyRows(initial));
  const diff = computed(() => diffRows(snapshot.value, rows.value, normalize));
  const dirtyCount = computed(
    () =>
      diff.value.added.length +
      diff.value.modified.length +
      diff.value.deleted.length,
  );
  const rowCount = computed(() => rows.value.length);

  function readRows() {
    if (tabulator.value) {
      rows.value = tabulator.value.getData() as Rows;
    }
  }

  // ── Undo history: whole-row states, one per person write ──
  let committed: Rows = copyRows(initial);
  const undoStack: Array<Rows> = [];
  const redoStack: Array<Rows> = [];
  let batching = false;
  let travelling = false;

  /**
   * Ends a person write: records the state before it as one undo step (if
   * any row changed) and reports `reported`, else the changed rows, once.
   */
  function commit(reported?: Array<string>) {
    const tab = tabulator.value;
    if (!tab) {
      return;
    }
    const next = copyRows(tab.getData());
    const changed = changedIds(committed, next);
    if (changed.length > 0) {
      undoStack.push(committed);
      redoStack.length = 0;
      committed = next;
    }
    readRows();
    if (reported || changed.length > 0) {
      onUserEdit?.(reported ?? changed);
    }
  }

  /** A person's write: every Tabulator change inside `write` is one step. */
  function personWrite(write: () => void, reported?: Array<string>) {
    batching = true;
    try {
      write();
    } finally {
      batching = false;
    }
    commit(reported);
  }

  /** After an agent write: the grid as it is now, and nothing to undo or redo. */
  function resetHistory() {
    const tab = tabulator.value;
    if (!tab) {
      return;
    }
    committed = copyRows(tab.getData());
    undoStack.length = 0;
    redoStack.length = 0;
    readRows();
  }

  async function travel(from: Array<Rows>, to: Array<Rows>) {
    const tab = tabulator.value;
    const target = from.at(-1);
    if (!tab || !target || travelling) {
      return;
    }
    from.pop();
    travelling = true;
    const changed = changedIds(committed, target);
    to.push(committed);
    committed = target;
    const refit = holdActiveCell(tab);
    try {
      refit(await writeRows(tab, target));
    } finally {
      travelling = false;
    }
    readRows();
    validateRows(tab, changed);
    onUserEdit?.(changed);
  }

  const undo = () => travel(undoStack, redoStack);
  const redo = () => travel(redoStack, undoStack);

  // ── beforeunload guard: warn on navigation with unsaved changes ──
  // VueUse useEventListener auto-cleans on unmount — no manual add/remove.
  useEventListener(window, 'beforeunload', (e: BeforeUnloadEvent) => {
    if (dirtyCount.value > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Undo/redo keys work wherever focus is, except in a control (an open
  // editor, a header filter) or while a dialog is open.
  useEventListener(document, 'keydown', (e: KeyboardEvent) => {
    const step = historyStep(e);
    if (
      !step ||
      fromControl(e.target) ||
      document.querySelector('[role="dialog"]')
    ) {
      return;
    }
    e.preventDefault();
    void (step === 'undo' ? undo() : redo());
  });

  // ── Person writes Tabulator makes itself ──

  /** `row` through `normalizeRow`, keeping its id. */
  function normalized(row: Row): Row {
    return { ...normalize(row), id: row.id };
  }

  function normalizeTabRow(row: RowComponent) {
    const before = row.getData() as Row;
    const after = normalized(before);
    if (JSON.stringify(after) !== JSON.stringify(before)) {
      void row.update(after);
    }
  }

  // A typed edit (or one cell of a range clear, which commits as a whole).
  const onCellEdited = (cell: CellComponent) => {
    const row = cell.getRow();
    normalizeTabRow(row);
    if (!batching) {
      commit([rowId(row)]);
    }
  };

  // The fill handle wrote the range's editable cells (Range.setData).
  const onRangeEdited = (range: EditedRange) => {
    const tab = tabulator.value;
    if (!tab) {
      return;
    }
    const touched = new Map(
      range.getModifiedCells().map((cell) => [rowId(cell.getRow()), cell]),
    );
    personWrite(() => {
      for (const cell of touched.values()) {
        normalizeTabRow(cell.getRow());
      }
      validateRows(tab, [...touched.keys()]);
    });
  };

  // ── Paste: over the selection when a cell is selected, else append ──

  function pasteOver(tab: Tabulator, origin: CellPos, text: string) {
    const live = tab.getData() as Rows;
    const change = overwritePaste(
      live,
      gridOrder(tab),
      origin,
      text,
      writableColumns(tab),
    );
    if (change.touchedIds.length === 0) {
      return;
    }
    const known = new Set(live.map((row) => row.id));
    const touched = new Set(change.touchedIds);
    personWrite(() => {
      const added: Array<Row> = [];
      for (const next of change.rows) {
        if (!touched.has(next.id)) {
          continue;
        }
        const row = normalized(next);
        if (known.has(row.id)) {
          void tab.getRow(row.id).update(row);
        } else {
          added.push(row);
        }
      }
      if (added.length > 0) {
        void tab.addData(added, false);
      }
      validateRows(tab, change.touchedIds);
    }, change.touchedIds);
  }

  function pasteRows(tab: Tabulator, text: string) {
    // ColumnDefinition is a closed interface; the parser reads plain records.
    const definitions = visibleColumns(tab).map(
      (column) => column.getDefinition() as unknown as Record<string, unknown>,
    );
    const positional = () => parseClipboardPaste(text, definitions);
    const parsed = opts.pasteParser
      ? opts.pasteParser(text, positional)
      : positional();
    const added = parsed.map((row) =>
      normalized({ ...row, id: crypto.randomUUID() }),
    );
    const ids = added.map((row) => row.id);
    personWrite(() => {
      if (added.length > 0) {
        void tab.addData(added, false);
        validateRows(tab, ids);
      }
    }, ids);
  }

  function onPaste(e: ClipboardEvent) {
    const tab = tabulator.value;
    if (!tab || fromControl(e.target)) {
      return;
    }
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    const origin = rangeOrigin(tab);
    if (origin) {
      pasteOver(tab, origin, text);
    } else {
      pasteRows(tab, text);
    }
  }

  // Delete/Backspace clears the range and Escape drops it, unless focus is
  // in an editor or a header filter (there the key edits text). Delete and
  // Backspace are swallowed: some browsers navigate back on Backspace.
  function onKeyDown(e: KeyboardEvent) {
    const tab = tabulator.value;
    if (!tab || fromControl(e.target)) {
      return;
    }
    if (e.key === 'Escape') {
      clearRanges(tab);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      personWrite(() => clearRangeCells(tab));
    }
  }

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
      const tab = new Tabulator(el, tabulatorOptions(initial, columns.value));
      // `rangeEdited` postdates the published Tabulator types.
      const rangeEvents = tab as unknown as RangeEvents;
      tabulator.value = tab;

      // Not `dataChanged`: with a listener, Tabulator builds `getData()` for
      // every row it adds (a 2,000-row paste took 7.7 s instead of 0.1 s).
      // Every write path re-reads the rows itself (`commit`, `travel`,
      // `resetHistory`); `dataProcessed` covers loads and `replaceData`.
      const onTableBuilt = () => fillRowsOnly(tab);
      const onColumnMoved = () => keepCheckboxFirst(tab);
      tab.on('dataProcessed', readRows);
      tab.on('cellEdited', onCellEdited);
      rangeEvents.on('rangeEdited', onRangeEdited);
      tab.on('tableBuilt', onTableBuilt);
      tab.on('columnMoved', onColumnMoved);
      tab.on('renderComplete', onRenderComplete);
      el.addEventListener('keydown', onKeyDown);
      el.addEventListener('paste', onPaste);

      onCleanup(() => {
        tab.off('dataProcessed', readRows);
        tab.off('cellEdited', onCellEdited);
        rangeEvents.off('rangeEdited', onRangeEdited);
        tab.off('tableBuilt', onTableBuilt);
        tab.off('columnMoved', onColumnMoved);
        tab.off('renderComplete', onRenderComplete);
        el.removeEventListener('keydown', onKeyDown);
        el.removeEventListener('paste', onPaste);
      });
    },
    { immediate: true },
  );

  // ── Add Row (top) ──
  function handleAddRow() {
    const tab = tabulator.value;
    if (!tab) {
      return;
    }
    const row = normalized({ id: crypto.randomUUID() });
    personWrite(() => {
      void tab.addRow(row, true);
    }, [row.id]);
  }

  // ── Column visibility (lasts until reload) ──
  const columnItems = ref(columnMenuItems(columns.value));

  function setColumnVisible(id: string, visible: boolean) {
    const column = tabulator.value?.getColumn(id);
    if (!column) {
      return;
    }
    if (visible) {
      column.show();
    } else {
      column.hide();
    }
    columnItems.value = columnItems.value.map((item) =>
      item.id === id ? { ...item, visible } : item,
    );
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
    const tabRows = tabulator.value.getRows();
    for (const err of errors) {
      const row = tabRows.find(
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

    readRows();
    const sent = copyRows(rows.value);
    const payload = buildSavePayload(diff.value);

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
        // The rows that were sent, not the current ones: an edit made while
        // the request was in flight stays dirty.
        snapshot.value = sent;
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
    const tabRows = tabulator.value.getRows();
    const row = tabRows.find(
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

  /**
   * The row's 1-based place in the grid as shown (sorted, filtered), or null
   * when it is filtered out or gone. Save errors carry the row's index in the
   * request, which is not where it sits on screen.
   */
  function rowNumber(rowId: string): number | null {
    void renderTick.value;
    // getRow(id) warns and returns false for an unknown id; search instead.
    const row = tabulator.value
      ?.getRows()
      .find((r) => r.getData().id === rowId);
    const position = row?.getPosition();
    return typeof position === 'number' ? position : null;
  }

  // ── VAL-GRID-029: clear the "Saved N" badge when a new change occurs ──
  watch(dirtyCount, (count) => {
    if (count > 0 && saveResult.value !== null) {
      saveResult.value = null;
    }
  });

  // ── Clear grid ──
  // VAL-CUSTOM-040 / VAL-GRID-023: clearing empties the grid, its errors and
  // the save result. The diff then lists every saved row as a delete, so
  // Save stays enabled and sends them; rows added since the last save were
  // never stored and send nothing.
  function clearGrid() {
    const tab = tabulator.value;
    if (tab) {
      clearRanges(tab);
      personWrite(() => tab.clearData(), []);
    }
    clearErrorHighlights();
    errorList.value = [];
    saveResult.value = null;
  }

  // ── Delete selected ──
  // VAL-CUSTOM-018: after deleting rows, filter errorList to remove entries
  // whose rowId matches any of the deleted row ids. Without this the error
  // sidebar would keep showing entries for rows that no longer exist in the
  // grid, and the toolbar error chip would over-count.
  function handleDeleteSelected() {
    const tab = tabulator.value;
    if (!tab) {
      return;
    }
    const selectedRows = tab.getSelectedRows();
    const ids = selectedRows.map((row) => String(row.getData().id));
    const refit = holdActiveCell(tab);
    personWrite(() => {
      for (const row of selectedRows) {
        void row.delete();
      }
    }, ids);
    refit(false);
    if (ids.length > 0 && errorList.value.length > 0) {
      const deleted = new Set(ids);
      errorList.value = errorList.value.filter(
        (err) => !deleted.has(err.rowId),
      );
    }
  }

  // ── Programmatic API (agent tools, file import) ──
  // Rows are addressed by `id` (never by position), touched rows are
  // validated so the in-cell highlight matches what a human edit would show,
  // and every write empties the undo and redo stacks (not undoable).
  function getRows(): Array<Record<string, unknown>> {
    return (tabulator.value?.getData() ?? []) as Array<Record<string, unknown>>;
  }

  async function addRows(
    added: Array<Record<string, unknown>>,
  ): Promise<Array<string>> {
    const tab = tabulator.value;
    if (!tab) {
      return [];
    }
    const withIds = added.map((r) => ({
      ...normalize(r),
      id: crypto.randomUUID(),
    }));
    const tabRows = await tab.addData(withIds);
    for (const row of tabRows ?? []) {
      row.validate?.();
    }
    resetHistory();
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
      row.validate?.();
      result.updated.push(id);
    }
    resetHistory();
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
      void row.delete();
      result.deleted.push(id);
    }
    errorList.value = errorList.value.filter(
      (e) => !result.deleted.includes(e.rowId),
    );
    resetHistory();
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
    columnItems,
    setColumnVisible,
    handleAddRow,
    handleSave,
    handleDeleteSelected,
    handleExportCSV,
    clearGrid,
    scrollToError,
    rowNumber,
    undo,
    redo,
    getRows,
    addRows,
    updateRows,
    deleteRows,
    showErrors,
  };
}
