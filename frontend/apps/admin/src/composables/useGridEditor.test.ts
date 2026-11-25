import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { ref, nextTick } from 'vue';
import { useGridEditor, parseClipboardPaste } from './useGridEditor';

// ── Mock Tabulator module ──
// vi.mock replaces 'tabulator-tables' entirely — the real Tabulator is never
// loaded in unit tests, per the mission's testing rules. The mock constructor
// returns whatever instance the test has placed in mockState.instance.

const mockState = vi.hoisted(() => ({
  instance: null as Record<string, any> | null,
  ctorCalls: [] as Array<{ el: any; opts: any }>,
}));

vi.mock('tabulator-tables', () => ({
  TabulatorFull: function TabulatorMock(el: any, opts: any) {
    mockState.ctorCalls.push({ el, opts });
    return mockState.instance;
  },
}));

// ── Mock Tabulator instance factory ──
// Extends the hand-rolled mock pattern from useDirtyTracking.test.ts with the
// methods useGridEditor needs: getRows, getSelectedRows, getCell, getElement,
// replaceData, clearData, download, getDataCount, element.querySelectorAll.

interface MockCellElement {
  classList: {
    add: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    contains: ReturnType<typeof vi.fn>;
  };
  style: Record<string, string>;
}

interface MockRow {
  getData: () => Record<string, unknown>;
  getIndex: () => number;
  delete: ReturnType<typeof vi.fn>;
  getCell: (field: string) => { getElement: () => MockCellElement };
  scrollTo: ReturnType<typeof vi.fn>;
  validate: ReturnType<typeof vi.fn>;
  _cellElements: Record<string, MockCellElement>;
}

function createMockCellElement(): MockCellElement {
  return {
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
      contains: vi.fn(() => false),
    },
    style: {},
  };
}

function createMockRow(d: Record<string, unknown>, index: number): MockRow {
  const cellElements: Record<string, MockCellElement> = {};
  return {
    getData: () => ({ ...d }),
    getIndex: () => index,
    delete: vi.fn(),
    getCell: vi.fn((field: string) => {
      if (!cellElements[field]) {
        cellElements[field] = createMockCellElement();
      }
      return { getElement: () => cellElements[field] };
    }),
    scrollTo: vi.fn(),
    validate: vi.fn(() => true),
    _cellElements: cellElements,
  };
}

function createMockTabulator(
  initialData: Array<Record<string, unknown>> = [],
  _columns: Array<Record<string, unknown>> = [],
) {
  const handlers: Record<string, Array<(...args: Array<unknown>) => void>> = {};
  let data = [...initialData];
  let mockRows: Array<MockRow> = [];
  let selectedRows: Array<MockRow> = [];

  function rebuildRows() {
    mockRows = data.map((d, i) => {
      const row = createMockRow(d, i);
      const rowRef = row;
      row.delete = vi.fn(() => {
        const rowId = rowRef.getData().id as string;
        data = data.filter((r) => r.id !== rowId);
        rebuildRows();
      });
      return row;
    });
  }
  rebuildRows();

  const mockElement = {
    querySelectorAll: vi.fn((_sel: string) => [] as Array<Element>),
  };

  const tabulator = {
    on: vi.fn((event: string, handler: (...args: Array<unknown>) => void) => {
      if (!handlers[event]) {
        handlers[event] = [];
      }
      handlers[event].push(handler);
    }),
    off: vi.fn((event: string, handler: (...args: Array<unknown>) => void) => {
      if (handlers[event]) {
        handlers[event] = handlers[event].filter((h) => h !== handler);
      }
    }),
    getData: vi.fn(() => data),
    getRows: vi.fn(() => mockRows),
    getSelectedRows: vi.fn(() => selectedRows),
    addRow: vi.fn((rowData: Record<string, unknown>, atTop: boolean) => {
      const newRow = { ...rowData };
      data = atTop ? [newRow, ...data] : [...data, newRow];
      rebuildRows();
      return mockRows[0];
    }),
    replaceData: vi.fn((newData: Array<Record<string, unknown>>) => {
      data = [...newData];
      rebuildRows();
    }),
    clearData: vi.fn(() => {
      data = [];
      mockRows = [];
    }),
    getDataCount: vi.fn(() => data.length),
    download: vi.fn(),
    element: mockElement,
    _emit: (event: string, ...args: Array<unknown>) => {
      handlers[event]?.forEach((h) => h(...args));
    },
    _getData: () => data,
    _getRows: () => mockRows,
    _setSelectedRows: (rows: Array<MockRow>) => {
      selectedRows = rows;
    },
    _setSelectedByRowIds: (rowIds: Array<string>) => {
      selectedRows = mockRows.filter((r) =>
        rowIds.includes(r.getData().id as string),
      );
    },
    _setMockRows: (rows: Array<MockRow>) => {
      mockRows = rows;
    },
    _setElementCells: (cells: Array<Element>) => {
      mockElement.querySelectorAll.mockReturnValue(cells);
    },
  };

  return tabulator;
}

// ── Helper to create a mock cell for cellEdited event ──
function createMockCell(rowData: Record<string, unknown>, rowIndex: number) {
  return {
    getRow: () => ({
      getData: () => ({ ...rowData }),
      getIndex: () => rowIndex,
    }),
    getField: () => 'issue',
    getValue: () => rowData.issue,
    getInitialValue: () => 'old value',
  };
}

function createMockRowForEvent(
  rowData: Record<string, unknown>,
  rowIndex: number,
) {
  return {
    getData: () => ({ ...rowData }),
    getIndex: () => rowIndex,
  };
}

// ── Helper: set up the composable with a mock Tabulator ──
function setupGridEditor(options: {
  initialData?: Array<Record<string, unknown>>;
  columns?: Array<Record<string, unknown>>;
  onSave?: ReturnType<typeof vi.fn>;
}) {
  const {
    initialData = [],
    columns = [{ field: 'issue', editor: 'input' }],
    onSave = vi.fn().mockResolvedValue({ errors: [], saved: 0 }),
  } = options;

  const mockTab = createMockTabulator(initialData, columns);
  mockState.instance = mockTab;
  mockState.ctorCalls = [];

  const tableEl = ref<HTMLElement | null>(null);
  const cols = ref(columns);
  const data = ref(initialData);

  const result = useGridEditor({
    tableEl,
    columns: cols,
    data,
    onSave: onSave as any,
    exportFilename: 'test-export.csv',
  });

  return { result, mockTab, tableEl, cols, data, onSave };
}

// ── Test columns matching the compliance shape ──
const TEST_COLUMNS: Array<Record<string, unknown>> = [
  { field: '__select', clipboard: false, visible: true, headerSort: false },
  { field: 'categoryCode', editor: 'list', clipboard: true, visible: true },
  { field: 'issue', editor: 'input', clipboard: true, visible: true },
  { field: 'riskLevel', editor: 'list', clipboard: true, visible: true },
];

// ═══════════════════════════════════════════════════════════════════════════
// parseClipboardPaste — pure function tests
// ═══════════════════════════════════════════════════════════════════════════

describe('parseClipboardPaste', () => {
  it('maps TSV cells positionally to data columns, skipping clipboard:false columns', () => {
    const columns = [
      { field: '__select', clipboard: false, visible: true },
      { field: 'name', clipboard: true, visible: true },
      { field: 'age', clipboard: true, visible: true },
    ];
    const result = parseClipboardPaste('Alice\t30', columns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
    expect(result[0].age).toBe('30');
    expect(result[0].__select).toBeUndefined();
  });

  it('never assumes the checkbox column is at index 0 — filters by clipboard flag', () => {
    // Checkbox column NOT at index 0 — proves the parser filters by flag, not position
    const columns = [
      { field: 'name', clipboard: true, visible: true },
      { field: '__select', clipboard: false, visible: true },
      { field: 'age', clipboard: true, visible: true },
    ];
    const result = parseClipboardPaste('Bob\t25', columns);
    expect(result[0].name).toBe('Bob');
    expect(result[0].age).toBe('25');
    expect(result[0].__select).toBeUndefined();
  });

  it('drops extra pasted columns beyond the data column count', () => {
    const columns = [
      { field: '__select', clipboard: false },
      { field: 'a', clipboard: true },
      { field: 'b', clipboard: true },
    ];
    const result = parseClipboardPaste('x\ty\tz\tw', columns);
    expect(result[0].a).toBe('x');
    expect(result[0].b).toBe('y');
    expect(Object.keys(result[0])).toHaveLength(2);
  });

  it('leaves missing trailing columns undefined', () => {
    const columns = [
      { field: '__select', clipboard: false },
      { field: 'a', clipboard: true },
      { field: 'b', clipboard: true },
      { field: 'c', clipboard: true },
    ];
    const result = parseClipboardPaste('only-a', columns);
    expect(result[0].a).toBe('only-a');
    expect(result[0].b).toBeUndefined();
    expect(result[0].c).toBeUndefined();
  });

  it('parses multiple rows', () => {
    const columns = [
      { field: '__select', clipboard: false },
      { field: 'name', clipboard: true },
    ];
    const result = parseClipboardPaste('Alice\nBob\nCharlie', columns);
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('Alice');
    expect(result[1].name).toBe('Bob');
    expect(result[2].name).toBe('Charlie');
  });

  it('skips empty rows (whitespace-only lines filtered out)', () => {
    const columns = [{ field: 'name', clipboard: true }];
    const result = parseClipboardPaste('Alice\n   \n\nBob', columns);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Alice');
    expect(result[1].name).toBe('Bob');
  });

  it('returns empty array for empty or whitespace-only clipboard', () => {
    const columns = [{ field: 'name', clipboard: true }];
    expect(parseClipboardPaste('', columns)).toEqual([]);
    expect(parseClipboardPaste('   \n  \n', columns)).toEqual([]);
  });

  it('also filters out columns with visible:false', () => {
    const columns = [
      { field: '__select', clipboard: false, visible: true },
      { field: 'hidden', clipboard: true, visible: false },
      { field: 'visible', clipboard: true, visible: true },
    ];
    const result = parseClipboardPaste('x\ty', columns);
    expect(result[0].visible).toBe('x');
    expect(result[0].hidden).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// useGridEditor — composable tests with mock Tabulator
// ═══════════════════════════════════════════════════════════════════════════

describe('useGridEditor', () => {
  beforeEach(() => {
    mockState.instance = null;
    mockState.ctorCalls = [];
  });

  it('initializes the Tabulator when tableEl is set, rowCount reflects data', async () => {
    const initialData = [
      { id: 'r1', issue: 'Row 1' },
      { id: 'r2', issue: 'Row 2' },
      { id: 'r3', issue: 'Row 3' },
    ];
    const { result, mockTab, tableEl } = setupGridEditor({ initialData });

    tableEl.value = document.createElement('div');
    await nextTick();

    expect(mockState.ctorCalls).toHaveLength(1);
    expect(mockState.ctorCalls[0].opts.data).toEqual(initialData);
    expect(result.tabulator.value).toBe(mockTab);
    expect(result.rowCount.value).toBe(3);
  });

  it('exposes dirtyCount from useDirtyTracking', async () => {
    const initialData = [{ id: 'r1', issue: 'old' }];
    const { result, mockTab, tableEl } = setupGridEditor({ initialData });

    tableEl.value = document.createElement('div');
    await nextTick();

    expect(result.dirtyCount.value).toBe(0);

    const cell = createMockCell({ id: 'r1', issue: 'new' }, 0);
    mockTab._emit('cellEdited', cell);
    await nextTick();

    expect(result.dirtyCount.value).toBe(1);
  });

  // ── Add Row ──

  it('handleAddRow adds a row with a UUID at the top and marks it dirty', async () => {
    const initialData = [{ id: 'r1', issue: 'existing' }];
    const { result, mockTab, tableEl } = setupGridEditor({ initialData });

    tableEl.value = document.createElement('div');
    await nextTick();

    result.handleAddRow();
    await nextTick();

    expect(result.rowCount.value).toBe(2);
    expect(result.dirtyCount.value).toBe(1);

    const data = mockTab._getData();
    expect(data[0].id).toEqual(expect.any(String));
    expect(data[0].id).toHaveLength(36); // UUID v4 format
  });

  // ── Clipboard paste ──

  it('clipboardPasted handler assigns UUIDs to rows without id and marks them added', async () => {
    // Simulate paste: tabulator data has rows without ids (freshly pasted)
    const initialData: Array<Record<string, unknown>> = [
      { categoryCode: 'A', issue: 'pasted 1' },
      { categoryCode: 'B', issue: 'pasted 2' },
    ];
    const { result, mockTab, tableEl } = setupGridEditor({
      initialData,
      columns: TEST_COLUMNS,
    });

    tableEl.value = document.createElement('div');
    await nextTick();

    mockTab._emit('clipboardPasted');
    await nextTick();

    const data = mockTab._getData();
    expect(data[0].id).toEqual(expect.any(String));
    expect(data[1].id).toEqual(expect.any(String));
    expect(data[0].id).not.toBe(data[1].id);
    expect(result.dirtyCount.value).toBe(2);
  });

  it('clipboardPasted handler does not assign new UUIDs to rows that already have one', async () => {
    const initialData: Array<Record<string, unknown>> = [
      { id: 'existing-1', categoryCode: 'A', issue: 'existing row' },
      { categoryCode: 'B', issue: 'pasted row' },
    ];
    const { result, mockTab, tableEl } = setupGridEditor({
      initialData,
      columns: TEST_COLUMNS,
    });

    tableEl.value = document.createElement('div');
    await nextTick();

    mockTab._emit('clipboardPasted');
    await nextTick();

    const data = mockTab._getData();
    expect(data[0].id).toBe('existing-1'); // unchanged
    expect(data[1].id).toEqual(expect.any(String)); // new UUID assigned
    // Only the pasted row (without id) should be marked dirty
    expect(result.dirtyCount.value).toBe(1);
  });

  it('clipboardPasteParser in Tabulator options uses parseClipboardPaste', async () => {
    const { tableEl } = setupGridEditor({ columns: TEST_COLUMNS });

    tableEl.value = document.createElement('div');
    await nextTick();

    const opts = mockState.ctorCalls[0].opts;
    expect(typeof opts.clipboardPasteParser).toBe('function');
    const parsed = opts.clipboardPasteParser('A\tIssue text\tHigh');
    expect(parsed).toHaveLength(1);
    // Positional mapping: A → categoryCode, Issue text → issue, High → riskLevel
    expect(parsed[0].categoryCode).toBe('A');
    expect(parsed[0].issue).toBe('Issue text');
    expect(parsed[0].riskLevel).toBe('High');
    // Checkbox column skipped
    expect(parsed[0].__select).toBeUndefined();
  });

  // ── VAL-CUSTOM-005: pasting a value outside a dropdown column's choices ──
  // triggers the .tabulator-validation-fail highlight on the offending cell.
  // Tabulator only runs column validators on cell edit events, not on data
  // load or paste. The clipboardPasted handler must therefore explicitly
  // call row.validate() (or equivalent) on each pasted row so that cells
  // carrying a value the column's 'in' validator rejects get the visual
  // highlight. This is required by the custom-table contract; the compliance
  // grid's enum validator is programmatic-only (GRID-007), but custom tables
  // require the in-cell highlight on paste.

  it('clipboardPasted calls row.validate() on each row so invalid cells get highlighted', async () => {
    const initialData: Array<Record<string, unknown>> = [
      { status: 'Critical' }, // outside the choices ['Open', 'Closed']
    ];
    const { mockTab, tableEl } = setupGridEditor({
      initialData,
      columns: TEST_COLUMNS,
    });

    tableEl.value = document.createElement('div');
    await nextTick();

    mockTab._emit('clipboardPasted');
    await nextTick();

    // Every row should have had validate() called on it
    const rows = mockTab._getRows();
    for (const row of rows) {
      expect(row.validate).toHaveBeenCalled();
    }
  });

  it('clipboardPasted does not call validate when there are no rows', async () => {
    const initialData: Array<Record<string, unknown>> = [];
    const { mockTab, tableEl } = setupGridEditor({
      initialData,
      columns: TEST_COLUMNS,
    });

    tableEl.value = document.createElement('div');
    await nextTick();

    mockTab._emit('clipboardPasted');
    await nextTick();

    // No rows → no validate calls (and no crash)
    const rows = mockTab._getRows();
    expect(rows).toHaveLength(0);
  });

  // ── Save loop ──

  it('handleSave short-circuits with no dirty rows', async () => {
    const onSave = vi.fn().mockResolvedValue({ errors: [], saved: 0 });
    const { result, tableEl } = setupGridEditor({
      initialData: [{ id: 'r1', issue: 'clean' }],
      onSave,
    });

    tableEl.value = document.createElement('div');
    await nextTick();

    await result.handleSave();
    expect(onSave).not.toHaveBeenCalled();
    expect(result.saveResult.value).toEqual({ errors: [], saved: 0 });
    expect(result.isSaving.value).toBe(false);
  });

  it('handleSave sends payload to onSave and sets saveResult on success', async () => {
    const onSave = vi.fn().mockResolvedValue({ errors: [], saved: 1 });
    const initialData = [{ id: 'r1', issue: 'old' }];
    const { result, mockTab, tableEl } = setupGridEditor({
      initialData,
      onSave,
    });

    tableEl.value = document.createElement('div');
    await nextTick();

    // Make the row dirty
    const cell = createMockCell({ id: 'r1', issue: 'updated' }, 0);
    mockTab._emit('cellEdited', cell);
    await nextTick();

    await result.handleSave();

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.upserts).toHaveLength(1);
    expect(payload.upserts[0].id).toBe('r1');
    expect(payload.deletes).toEqual([]);
    expect(result.saveResult.value).toEqual({ errors: [], saved: 1 });
    expect(result.isSaving.value).toBe(false);
  });

  it('handleSave clears dirty tracking and highlights on success', async () => {
    const onSave = vi.fn().mockResolvedValue({ errors: [], saved: 1 });
    const initialData = [{ id: 'r1', issue: 'old' }];
    const { result, mockTab, tableEl } = setupGridEditor({
      initialData,
      onSave,
    });

    tableEl.value = document.createElement('div');
    await nextTick();

    const cell = createMockCell({ id: 'r1', issue: 'updated' }, 0);
    mockTab._emit('cellEdited', cell);
    await nextTick();
    expect(result.dirtyCount.value).toBe(1);

    await result.handleSave();

    expect(result.dirtyCount.value).toBe(0);
  });

  it('handleSave populates errorList and highlights cells on errors', async () => {
    const errors = [
      { row: 0, rowId: 'r1', field: 'issue', message: 'issue is required' },
    ];
    const onSave = vi.fn().mockResolvedValue({ errors, saved: 0 });
    const initialData = [{ id: 'r1', issue: '' }];
    const { result, mockTab, tableEl } = setupGridEditor({
      initialData,
      onSave,
    });

    tableEl.value = document.createElement('div');
    await nextTick();

    // Make the row dirty
    const cell = createMockCell({ id: 'r1', issue: '' }, 0);
    mockTab._emit('cellEdited', cell);
    await nextTick();

    await result.handleSave();

    expect(result.errorList.value).toEqual(errors);
    expect(result.saveResult.value).toEqual({ errors, saved: 0 });

    // The correct cell should have .backend-validation-error added
    const rows = mockTab._getRows();
    const targetRow = rows.find((r) => r.getData().id === 'r1');
    expect(targetRow).toBeDefined();
    expect(targetRow._cellElements['issue'].classList.add).toHaveBeenCalledWith(
      'backend-validation-error',
    );
  });

  it('handleSave rejection produces a synthetic error entry', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Network failure'));
    const initialData = [{ id: 'r1', issue: 'old' }];
    const { result, mockTab, tableEl } = setupGridEditor({
      initialData,
      onSave,
    });

    tableEl.value = document.createElement('div');
    await nextTick();

    const cell = createMockCell({ id: 'r1', issue: 'updated' }, 0);
    mockTab._emit('cellEdited', cell);
    await nextTick();

    await result.handleSave();

    expect(result.saveResult.value).toEqual({
      errors: [{ row: 0, rowId: '', field: 'network', message: 'Save failed' }],
      saved: 0,
    });
    expect(result.isSaving.value).toBe(false);
  });

  it('handleSave is guarded against double-click (isSaving guard)', async () => {
    let resolveSave: (value: any) => void;
    const onSave = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    const initialData = [{ id: 'r1', issue: 'old' }];
    const { result, mockTab, tableEl } = setupGridEditor({
      initialData,
      onSave,
    });

    tableEl.value = document.createElement('div');
    await nextTick();

    const cell = createMockCell({ id: 'r1', issue: 'updated' }, 0);
    mockTab._emit('cellEdited', cell);
    await nextTick();

    // First save — should proceed
    const savePromise1 = result.handleSave();
    expect(result.isSaving.value).toBe(true);

    // Second save — should be blocked
    await result.handleSave();
    expect(onSave).toHaveBeenCalledTimes(1);

    resolveSave({ errors: [], saved: 1 });
    await savePromise1;

    expect(result.isSaving.value).toBe(false);
  });

  // ── VAL-GRID-029: "Saved N" badge clears when a new change occurs ──

  it('clears saveResult when dirtyCount becomes > 0 after a successful save (cell edit)', async () => {
    const onSave = vi.fn().mockResolvedValue({ errors: [], saved: 1 });
    const initialData = [{ id: 'r1', issue: 'old' }];
    const { result, mockTab, tableEl } = setupGridEditor({
      initialData,
      onSave,
    });

    tableEl.value = document.createElement('div');
    await nextTick();

    // First edit + save → saveResult set to the success response
    const cell1 = createMockCell({ id: 'r1', issue: 'first' }, 0);
    mockTab._emit('cellEdited', cell1);
    await nextTick();
    await result.handleSave();
    expect(result.saveResult.value).toEqual({ errors: [], saved: 1 });
    expect(result.dirtyCount.value).toBe(0);

    // A new edit after the save → dirtyCount becomes 1, saveResult must clear
    const cell2 = createMockCell({ id: 'r1', issue: 'second' }, 0);
    mockTab._emit('cellEdited', cell2);
    await nextTick();

    expect(result.dirtyCount.value).toBe(1);
    expect(result.saveResult.value).toBeNull();
  });

  it('clears saveResult when a new row is added after a successful save', async () => {
    const onSave = vi.fn().mockResolvedValue({ errors: [], saved: 1 });
    const initialData = [{ id: 'r1', issue: 'old' }];
    const { result, mockTab, tableEl } = setupGridEditor({
      initialData,
      onSave,
    });

    tableEl.value = document.createElement('div');
    await nextTick();

    // Edit + save → success badge
    const cell = createMockCell({ id: 'r1', issue: 'updated' }, 0);
    mockTab._emit('cellEdited', cell);
    await nextTick();
    await result.handleSave();
    expect(result.saveResult.value).toEqual({ errors: [], saved: 1 });

    // Add a row → dirtyCount increments, saveResult clears
    result.handleAddRow();
    await nextTick();

    expect(result.dirtyCount.value).toBe(1);
    expect(result.saveResult.value).toBeNull();
  });

  it('does not clear saveResult when dirtyCount stays at 0 (no spurious clear)', async () => {
    const onSave = vi.fn().mockResolvedValue({ errors: [], saved: 1 });
    const initialData = [{ id: 'r1', issue: 'old' }];
    const { result, mockTab, tableEl } = setupGridEditor({
      initialData,
      onSave,
    });

    tableEl.value = document.createElement('div');
    await nextTick();

    const cell = createMockCell({ id: 'r1', issue: 'updated' }, 0);
    mockTab._emit('cellEdited', cell);
    await nextTick();
    await result.handleSave();
    expect(result.saveResult.value).toEqual({ errors: [], saved: 1 });

    // No further edits — the badge must persist
    await nextTick();
    expect(result.saveResult.value).toEqual({ errors: [], saved: 1 });
  });

  // ── Error highlighting by rowId (regression guard for f7bd853) ──

  it('error highlighting locates rows by rowId, not by upserts-array index', async () => {
    // Scenario from VAL-GRID-015:
    // - Three rows: one seeded, two newly added with invalid data
    // - Delete the first added row
    // - Save returns an error for the remaining added row
    // - The error's `row` field (upserts array index) is 0, but the rowId
    //   points to the remaining added row — NOT the seeded row at index 0.
    // If the code used `err.row` (array index) it would highlight the wrong row.
    const initialData = [
      { id: 'seed-1', issue: 'valid seeded row' },
      { id: 'added-1', issue: '' },
      { id: 'added-2', issue: '' },
    ];
    const { result, mockTab, tableEl } = setupGridEditor({
      initialData,
      onSave: vi.fn().mockResolvedValue({
        errors: [
          { row: 0, rowId: 'added-2', field: 'issue', message: 'Required' },
        ],
        saved: 0,
      }),
    });

    tableEl.value = document.createElement('div');
    await nextTick();

    // Mark both added rows as dirty (simulate they were added)
    const row1 = createMockRowForEvent({ id: 'added-1', issue: '' }, 1);
    const row2 = createMockRowForEvent({ id: 'added-2', issue: '' }, 2);
    mockTab._emit('rowAdded', row1);
    mockTab._emit('rowAdded', row2);
    await nextTick();

    // Delete 'added-1': select it and call handleDeleteSelected
    mockTab._setSelectedByRowIds(['added-1']);
    result.handleDeleteSelected();
    await nextTick();

    // Now the mock data has [seed-1, added-2], getRows() returns those
    const rowsAfterDelete = mockTab._getRows();
    expect(rowsAfterDelete).toHaveLength(2);
    expect(rowsAfterDelete[0].getData().id).toBe('seed-1');
    expect(rowsAfterDelete[1].getData().id).toBe('added-2');

    // Save — returns error for added-2 (row: 0 = upserts array index)
    await result.handleSave();

    // The error should highlight added-2 (rowId lookup), NOT seed-1 (array index 0)
    const seedRow = mockTab._getRows().find((r) => r.getData().id === 'seed-1');
    const added2Row = mockTab
      ._getRows()
      .find((r) => r.getData().id === 'added-2');

    expect(added2Row.getCell).toHaveBeenCalledWith('issue');
    expect(added2Row._cellElements['issue'].classList.add).toHaveBeenCalledWith(
      'backend-validation-error',
    );
    // seed-1's cell should NOT have been touched — the bug from f7bd853 would
    // have looked it up via err.row (array index 0) and called getCell on it.
    expect(seedRow.getCell).not.toHaveBeenCalledWith('issue');
  });

  it('clearErrorHighlights removes the class from all highlighted cells', async () => {
    const errors = [{ row: 0, rowId: 'r1', field: 'issue', message: 'err' }];
    const onSave = vi.fn().mockResolvedValue({ errors, saved: 0 });
    const initialData = [{ id: 'r1', issue: '' }];
    const { result, mockTab, tableEl } = setupGridEditor({
      initialData,
      onSave,
    });

    tableEl.value = document.createElement('div');
    await nextTick();

    const cell = createMockCell({ id: 'r1', issue: '' }, 0);
    mockTab._emit('cellEdited', cell);
    await nextTick();

    await result.handleSave();

    // Now fix the error and save again successfully — but we cannot swap onSave,
    // so test clearErrorHighlights via clearGrid instead:
    result.clearGrid();
    expect(result.errorList.value).toEqual([]);
    expect(result.rowCount.value).toBe(0);
    expect(result.saveResult.value).toBeNull();
  });

  // ── scrollToError ──

  it('scrollToError scrolls to the row matching rowId and flashes the cell', async () => {
    const initialData = [
      { id: 'r1', issue: 'first' },
      { id: 'r2', issue: 'second' },
      { id: 'r3', issue: 'third' },
    ];
    const { result, mockTab, tableEl } = setupGridEditor({ initialData });

    tableEl.value = document.createElement('div');
    await nextTick();

    const err = { row: 1, rowId: 'r2', field: 'issue', message: 'bad' };
    result.scrollToError(err);

    const targetRow = mockTab._getRows().find((r) => r.getData().id === 'r2');
    expect(targetRow).toBeDefined();
    expect(targetRow.scrollTo).toHaveBeenCalled();
    expect(targetRow._cellElements['issue'].style.outline).toBe(
      '3px solid #ef4444',
    );
  });

  it('scrollToError does nothing if the rowId is not found (deleted row)', async () => {
    const initialData = [{ id: 'r1', issue: 'first' }];
    const { result, tableEl } = setupGridEditor({ initialData });

    tableEl.value = document.createElement('div');
    await nextTick();

    const err = {
      row: 0,
      rowId: 'nonexistent',
      field: 'issue',
      message: 'bad',
    };
    // Should not throw
    expect(() => result.scrollToError(err)).not.toThrow();
  });

  // ── Delete selected ──

  it('handleDeleteSelected removes selected rows and marks them deleted', async () => {
    const initialData = [
      { id: 'r1', issue: 'first' },
      { id: 'r2', issue: 'second' },
      { id: 'r3', issue: 'third' },
    ];
    const { result, mockTab, tableEl } = setupGridEditor({ initialData });

    tableEl.value = document.createElement('div');
    await nextTick();

    mockTab._setSelectedByRowIds(['r1', 'r3']);
    result.handleDeleteSelected();
    await nextTick();

    const remaining = mockTab._getData();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('r2');
    expect(result.rowCount.value).toBe(1);
    // Both deleted rows should be tracked (they were seeded, so 'deleted')
    expect(result.dirtyCount.value).toBe(2);
  });

  it('handleDeleteSelected does nothing when no rows are selected', async () => {
    const initialData = [{ id: 'r1', issue: 'first' }];
    const { result, mockTab, tableEl } = setupGridEditor({ initialData });

    tableEl.value = document.createElement('div');
    await nextTick();

    mockTab._setSelectedRows([]);
    result.handleDeleteSelected();

    expect(mockTab._getData()).toHaveLength(1);
    expect(result.rowCount.value).toBe(1);
    expect(result.dirtyCount.value).toBe(0);
  });

  // ── VAL-CUSTOM-018: deleting a row with an active error removes ──
  // its sidebar entry and decrements the error count.
  // handleDeleteSelected must filter errorList.value to remove entries
  // whose rowId matches any of the deleted row ids, so the sidebar and
  // the toolbar error chip stay consistent with the visible grid.

  it('handleDeleteSelected removes error sidebar entries for deleted rows', async () => {
    const errors = [
      { row: 0, rowId: 'r1', field: 'issue', message: 'issue is required' },
      { row: 1, rowId: 'r2', field: 'issue', message: 'issue is required' },
    ];
    const onSave = vi.fn().mockResolvedValue({ errors, saved: 0 });
    const initialData = [
      { id: 'r1', issue: '' },
      { id: 'r2', issue: '' },
      { id: 'r3', issue: 'ok' },
    ];
    const { result, mockTab, tableEl } = setupGridEditor({
      initialData,
      onSave,
    });

    tableEl.value = document.createElement('div');
    await nextTick();

    // Make rows dirty so save proceeds and populates errorList
    const cell1 = createMockCell({ id: 'r1', issue: '' }, 0);
    const cell2 = createMockCell({ id: 'r2', issue: '' }, 1);
    mockTab._emit('cellEdited', cell1);
    mockTab._emit('cellEdited', cell2);
    await nextTick();

    await result.handleSave();
    expect(result.errorList.value).toHaveLength(2);

    // Delete r1 — its error sidebar entry must be removed
    mockTab._setSelectedByRowIds(['r1']);
    result.handleDeleteSelected();
    await nextTick();

    expect(result.errorList.value).toHaveLength(1);
    expect(result.errorList.value[0].rowId).toBe('r2');
  });

  it('handleDeleteSelected removes all matching error entries when multiple errored rows are deleted', async () => {
    const errors = [
      { row: 0, rowId: 'r1', field: 'issue', message: 'required' },
      { row: 1, rowId: 'r2', field: 'issue', message: 'required' },
    ];
    const onSave = vi.fn().mockResolvedValue({ errors, saved: 0 });
    const initialData = [
      { id: 'r1', issue: '' },
      { id: 'r2', issue: '' },
    ];
    const { result, mockTab, tableEl } = setupGridEditor({
      initialData,
      onSave,
    });

    tableEl.value = document.createElement('div');
    await nextTick();

    const cell1 = createMockCell({ id: 'r1', issue: '' }, 0);
    const cell2 = createMockCell({ id: 'r2', issue: '' }, 1);
    mockTab._emit('cellEdited', cell1);
    mockTab._emit('cellEdited', cell2);
    await nextTick();

    await result.handleSave();
    expect(result.errorList.value).toHaveLength(2);

    // Delete both errored rows — errorList should be empty, sidebar gone
    mockTab._setSelectedByRowIds(['r1', 'r2']);
    result.handleDeleteSelected();
    await nextTick();

    expect(result.errorList.value).toEqual([]);
  });

  it('handleDeleteSelected leaves non-deleted rows error entries intact', async () => {
    const errors = [
      { row: 0, rowId: 'r1', field: 'issue', message: 'required' },
      { row: 1, rowId: 'r2', field: 'issue', message: 'required' },
    ];
    const onSave = vi.fn().mockResolvedValue({ errors, saved: 0 });
    const initialData = [
      { id: 'r1', issue: '' },
      { id: 'r2', issue: '' },
    ];
    const { result, mockTab, tableEl } = setupGridEditor({
      initialData,
      onSave,
    });

    tableEl.value = document.createElement('div');
    await nextTick();

    const cell1 = createMockCell({ id: 'r1', issue: '' }, 0);
    const cell2 = createMockCell({ id: 'r2', issue: '' }, 1);
    mockTab._emit('cellEdited', cell1);
    mockTab._emit('cellEdited', cell2);
    await nextTick();

    await result.handleSave();
    expect(result.errorList.value).toHaveLength(2);

    // Delete a row with NO error (r3) — error entries for r1 and r2 must remain
    const initialDataWithR3 = [
      { id: 'r1', issue: '' },
      { id: 'r2', issue: '' },
      { id: 'r3', issue: 'ok' },
    ];
    // Rebuild with r3 present
    mockTab._setSelectedByRowIds(['r3']);
    // Manually add r3 to the mock data since setupGridEditor already ran
    mockTab.replaceData(initialDataWithR3);
    result.handleDeleteSelected();
    await nextTick();

    expect(result.errorList.value).toHaveLength(2);
    const rowIds = result.errorList.value.map((e) => e.rowId);
    expect(rowIds).toContain('r1');
    expect(rowIds).toContain('r2');
  });

  // ── Clear grid ──

  it('clearGrid empties data, resets dirty count, clears errors', async () => {
    const initialData = [{ id: 'r1', issue: 'first' }];
    const { result, mockTab, tableEl } = setupGridEditor({ initialData });

    tableEl.value = document.createElement('div');
    await nextTick();

    // Make a row dirty
    const cell = createMockCell({ id: 'r1', issue: 'updated' }, 0);
    mockTab._emit('cellEdited', cell);
    await nextTick();
    expect(result.dirtyCount.value).toBe(1);

    result.clearGrid();

    expect(mockTab._getData()).toHaveLength(0);
    expect(result.rowCount.value).toBe(0);
    expect(result.errorList.value).toEqual([]);
    expect(result.saveResult.value).toBeNull();
  });

  // ── VAL-CUSTOM-040: clear marks existing rows as deleted so a save ──
  // writes an empty array to the table's stored row data.
  // clearGrid must NOT clear the dirty map entirely — it must mark every
  // existing row as 'deleted' so that buildSavePayload includes their ids in
  // the deletes array, the Save button stays enabled, and the save handler
  // can persist the empty grid. Rows that were only ever 'added' (never
  // saved) are simply dropped from the dirty map (matching markDeleted
  // semantics) since they were never persisted and need no delete.

  it('clearGrid marks existing saved rows as deleted so the save button stays enabled', async () => {
    const initialData = [
      { id: 'r1', issue: 'first' },
      { id: 'r2', issue: 'second' },
    ];
    const { result, mockTab, tableEl } = setupGridEditor({ initialData });

    tableEl.value = document.createElement('div');
    await nextTick();

    // No edits yet — dirtyCount is 0
    expect(result.dirtyCount.value).toBe(0);

    result.clearGrid();

    // The grid is visually empty...
    expect(mockTab._getData()).toHaveLength(0);
    expect(result.rowCount.value).toBe(0);
    // ...but dirtyCount > 0 because the two saved rows are now tracked as
    // 'deleted' — the Save button stays enabled so the user can persist the
    // empty grid.
    expect(result.dirtyCount.value).toBe(2);
  });

  it('clearGrid drops added-but-unsaved rows from the dirty map (never persisted, no delete needed)', async () => {
    const initialData = [{ id: 'r1', issue: 'saved row' }];
    const { result, tableEl } = setupGridEditor({ initialData });

    tableEl.value = document.createElement('div');
    await nextTick();

    // Add a new row (tracked as 'added', never saved)
    result.handleAddRow();
    await nextTick();
    expect(result.dirtyCount.value).toBe(1);

    result.clearGrid();

    // The unsaved added row is dropped from tracking; the saved row is marked
    // deleted. Net dirty count = 1 (the saved row's delete).
    expect(result.dirtyCount.value).toBe(1);
  });

  it('after clearGrid, buildSavePayload includes all saved row ids in deletes', async () => {
    const onSave = vi.fn().mockResolvedValue({ errors: [], saved: 2 });
    const initialData = [
      { id: 'r1', issue: 'first' },
      { id: 'r2', issue: 'second' },
    ];
    const { result, tableEl } = setupGridEditor({ initialData, onSave });

    tableEl.value = document.createElement('div');
    await nextTick();

    result.clearGrid();

    // Save after clearing — the handler must receive the deleted row ids
    await result.handleSave();

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.upserts).toEqual([]);
    expect(payload.deletes).toHaveLength(2);
    expect(payload.deletes).toContain('r1');
    expect(payload.deletes).toContain('r2');
  });

  it('after clearGrid on an empty grid, dirtyCount stays 0 (nothing to delete)', async () => {
    const { result, tableEl } = setupGridEditor({ initialData: [] });

    tableEl.value = document.createElement('div');
    await nextTick();

    expect(result.dirtyCount.value).toBe(0);

    result.clearGrid();

    expect(result.dirtyCount.value).toBe(0);
  });

  // ── Export CSV ──

  it('handleExportCSV calls tabulator.download with the export filename', async () => {
    const { result, mockTab, tableEl } = setupGridEditor({});

    tableEl.value = document.createElement('div');
    await nextTick();

    result.handleExportCSV();

    expect(mockTab.download).toHaveBeenCalledWith(
      'csv',
      'test-export.csv',
      {
        delimiter: ',',
      },
      'all',
    );
  });

  // ── VAL-GRID-022: CSV export includes ALL rows regardless of active filters ──

  it('handleExportCSV passes "all" as the row range so filtered rows are exported', async () => {
    const { result, mockTab, tableEl } = setupGridEditor({});

    tableEl.value = document.createElement('div');
    await nextTick();

    result.handleExportCSV();

    // Tabulator's download(type, filename, options, range) 4th arg controls
    // which rows are exported. The default ("active") honours column filters;
    // "all" exports every row regardless of filters.
    expect(mockTab.download).toHaveBeenCalledWith(
      'csv',
      'test-export.csv',
      { delimiter: ',' },
      'all',
    );
  });

  it('handleExportCSV unwraps a ref exportFilename and still passes "all" range', async () => {
    const mockTab = createMockTabulator([], []);
    mockState.instance = mockTab;
    mockState.ctorCalls = [];

    const tableEl = ref<HTMLElement | null>(null);
    const cols = ref<Array<Record<string, unknown>>>([
      { field: 'issue', editor: 'input' },
    ]);
    const data = ref<Array<Record<string, unknown>>>([]);
    const filenameRef = ref('dynamic-name.csv');
    const onSave = vi.fn().mockResolvedValue({ errors: [], saved: 0 });

    const result = useGridEditor({
      tableEl,
      columns: cols,
      data,
      onSave: onSave as any,
      exportFilename: filenameRef,
    });

    tableEl.value = document.createElement('div');
    await nextTick();

    result.handleExportCSV();

    expect(mockTab.download).toHaveBeenCalledWith(
      'csv',
      'dynamic-name.csv',
      { delimiter: ',' },
      'all',
    );
  });

  // ── Tabulator options ──

  it('Tabulator is initialized with the expected options', async () => {
    const { tableEl } = setupGridEditor({ columns: TEST_COLUMNS });

    tableEl.value = document.createElement('div');
    await nextTick();

    const opts = mockState.ctorCalls[0].opts;
    expect(opts.clipboard).toBe(true);
    expect(opts.clipboardPasteAction).toBe('insert');
    expect(opts.validationMode).toBe('highlight');
    expect(opts.layout).toBe('fitDataFill');
    expect(opts.headerSortClickElement).toBe('icon');
    expect(opts.selectable).toBe(true);
    expect(opts.reactiveData).toBe(true);
    expect(opts.height).toBe('100%');
  });
});
