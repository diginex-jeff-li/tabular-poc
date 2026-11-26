import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { ref, nextTick } from 'vue';
import {
  useGridEditor,
  parseClipboardPaste,
  clearRangeCells,
} from './useGridEditor';

// ── Mock Tabulator module ──
// vi.mock replaces 'tabulator-tables' entirely — the real Tabulator is never
// loaded in unit tests. The mock constructor builds an in-memory table over
// the `data` option it is given, so the composable's writes land on plain
// row objects the tests can read back.

const mockState = vi.hoisted(() => ({
  instance: null as MockTab | null,
  ctorCalls: [] as Array<{ el: unknown; opts: Record<string, unknown> }>,
}));

vi.mock('tabulator-tables', () => ({
  TabulatorFull: function TabulatorMock(
    el: unknown,
    opts: { data: Array<Data>; columns: Array<Data> },
  ) {
    mockState.ctorCalls.push({ el, opts });
    mockState.instance = createMockTabulator(opts.data, opts.columns);
    return mockState.instance;
  },
}));

type Data = Record<string, unknown>;
type Handler = (...args: Array<never>) => void;

interface MockColumn {
  getField(): string;
  getDefinition(): Data;
  isVisible(): boolean;
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
}

interface MockCell {
  element: {
    classList: {
      add: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    };
    style: Record<string, string>;
  };
  getElement(): MockCell['element'];
  getField(): string;
  getValue(): unknown;
  getRow(): MockRow;
  getColumn(): Pick<MockColumn, 'getDefinition'>;
  setValue(value: unknown): void;
}

interface MockRow {
  getData(): Data;
  getPosition(): number;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  getCell: ReturnType<typeof vi.fn<(field: string) => MockCell>>;
  scrollTo: ReturnType<typeof vi.fn>;
  validate: ReturnType<typeof vi.fn>;
  reformat: ReturnType<typeof vi.fn>;
  getElement(): HTMLElement | null;
}

interface MockRange {
  getStructuredCells(): Array<Array<MockCell>>;
  getCells(): Array<Array<MockCell>>;
  remove(): void;
}

// A small Tabulator: rows are the data objects themselves (Tabulator edits
// them in place), cells and their elements are cached per row and field so a
// test can inspect what the composable did to them.
function createMockTabulator(
  initialData: Array<Data>,
  columnDefs: Array<Data>,
) {
  const handlers: Record<string, Array<Handler>> = {};
  let data: Array<Data> = [...initialData];
  let selectedIds: Array<string> = [];
  let ranges: Array<MockRange> = [];
  const rows = new WeakMap<Data, MockRow>();
  const hidden = new Set<string>();
  let columns: Array<MockColumn> = columnDefs.map((def) => ({
    getField: () => String(def.field),
    getDefinition: () => def,
    isVisible: () => def.visible !== false && !hidden.has(String(def.field)),
    show: vi.fn(() => hidden.delete(String(def.field))),
    hide: vi.fn(() => hidden.add(String(def.field))),
  }));

  const emit = (event: string, ...args: Array<unknown>) => {
    for (const handler of handlers[event] ?? []) {
      (handler as (...a: Array<unknown>) => void)(...args);
    }
  };

  function rowFor(d: Data): MockRow {
    const cached = rows.get(d);
    if (cached) {
      return cached;
    }
    const cells = new Map<string, MockCell>();
    const row: MockRow = {
      getData: () => d,
      getPosition: () => data.indexOf(d) + 1,
      update: vi.fn(async (fields: Data) => {
        Object.assign(d, fields);
      }),
      delete: vi.fn(async () => {
        data = data.filter((r) => r !== d);
      }),
      getCell: vi.fn((field: string) => {
        const known = cells.get(field);
        if (known) {
          return known;
        }
        const cell: MockCell = {
          element: {
            classList: { add: vi.fn(), remove: vi.fn() },
            style: {},
          },
          getElement: () => cell.element,
          getField: () => field,
          getValue: () => d[field],
          getRow: () => row,
          getColumn: () =>
            columns.find((c) => c.getField() === field) ?? {
              getDefinition: () => ({ field }),
            },
          setValue: (value: unknown) => {
            d[field] = value;
            emit('cellEdited', cell);
          },
        };
        cells.set(field, cell);
        return cell;
      }),
      scrollTo: vi.fn(),
      validate: vi.fn(() => true),
      reformat: vi.fn(),
      getElement: () => null,
    };
    rows.set(d, row);
    return row;
  }

  function byId(id: string): Data {
    const found = data.find((d) => d.id === id);
    if (!found) {
      throw new Error(`no row ${id}`);
    }
    return found;
  }
  const isSelected = (d: Data) => selectedIds.includes(String(d.id));

  return {
    on: vi.fn((event: string, handler: Handler) => {
      (handlers[event] ??= []).push(handler);
    }),
    off: vi.fn((event: string, handler: Handler) => {
      handlers[event] = (handlers[event] ?? []).filter((h) => h !== handler);
    }),
    getData: vi.fn((): Array<Data> => [...data]),
    getRows: vi.fn((): Array<MockRow> => data.map(rowFor)),
    getRow: vi.fn((id: string): MockRow | false => {
      const d = data.find((r) => r.id === id);
      return d ? rowFor(d) : false;
    }),
    getSelectedRows: vi.fn((): Array<MockRow> =>
      data.filter(isSelected).map(rowFor),
    ),
    getSelectedData: vi.fn((): Array<Data> => data.filter(isSelected)),
    selectRow: vi.fn((ids: Array<string>) => {
      selectedIds = ids;
    }),
    addRow: vi.fn((rowData: Data, top: boolean) => {
      data = top ? [rowData, ...data] : [...data, rowData];
      return Promise.resolve(rowFor(rowData));
    }),
    addData: vi.fn((list: Array<Data>, top?: boolean) => {
      data = top ? [...list, ...data] : [...data, ...list];
      return Promise.resolve(list.map(rowFor));
    }),
    replaceData: vi.fn((list: Array<Data>) => {
      data = [...list];
      return Promise.resolve();
    }),
    clearData: vi.fn(() => {
      data = [];
    }),
    getDataCount: vi.fn(() => data.length),
    getColumns: vi.fn((): Array<MockColumn> => columns),
    getColumn: vi.fn((field: string): MockColumn | undefined =>
      columns.find((c) => c.getField() === field),
    ),
    moveColumn: vi.fn((from: MockColumn, to: MockColumn, after: boolean) => {
      const rest = columns.filter((c) => c !== from);
      const at = rest.indexOf(to) + (after ? 1 : 0);
      columns = [...rest.slice(0, at), from, ...rest.slice(at)];
    }),
    getRanges: vi.fn((): Array<MockRange> => ranges),
    addRange: vi.fn((start: MockCell) => {
      ranges = [
        {
          getStructuredCells: () => [[start]],
          getCells: () => [[start]],
          remove: () => {
            ranges = [];
          },
        },
      ];
    }),
    download: vi.fn(),
    element: {
      querySelectorAll: vi.fn((_sel: string): Array<Element> => []),
    },
    _emit: emit,
    _getData: (): Array<Data> => data,
    _row: (id: string): MockRow => rowFor(byId(id)),
    _select: (ids: Array<string>) => {
      selectedIds = ids;
    },
    /** One range over `cells` (rows of [rowId, field]), like a drag. */
    _setRange: (cells: Array<Array<[string, string]>>) => {
      const structured = cells.map((line) =>
        line.map(([id, field]) => rowFor(byId(id)).getCell(field)),
      );
      ranges = [
        {
          getStructuredCells: () => structured,
          getCells: () => structured,
          remove: () => {
            ranges = [];
          },
        },
      ];
    },
    _moveColumnToFront: (field: string) => {
      columns = [
        ...columns.filter((c) => c.getField() === field),
        ...columns.filter((c) => c.getField() !== field),
      ];
    },
    _fieldOrder: () => columns.map((c) => c.getField()),
  };
}

type MockTab = ReturnType<typeof createMockTabulator>;

/** A person typing `value` into a cell: Tabulator sets it, then fires cellEdited. */
function typeInto(tab: MockTab, id: string, field: string, value: unknown) {
  tab._row(id).getCell(field).setValue(value);
}

/** A paste event on the grid element, as Tabulator's host receives it. */
function paste(el: HTMLElement, text: string, target: HTMLElement = el) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: () => text },
  });
  target.dispatchEvent(event);
  return event;
}

function key(init: KeyboardEventInit, target: EventTarget = document) {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
  );
}

/** Lets an undo started by a key event (async) finish. */
function flush(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve);
  return promise;
}

// ── Helper: set up the composable over a mock Tabulator ──
async function setupGridEditor(
  options: {
    initialData?: Array<Data>;
    columns?: Array<Data>;
    onSave?: ReturnType<typeof vi.fn>;
    normalizeRow?: (row: Data) => Data;
    pasteParser?: (text: string, positional: () => Array<Data>) => Array<Data>;
  } = {},
) {
  const {
    initialData = [],
    columns = [{ field: 'issue', title: 'Issue', editor: 'input' }],
    onSave = vi.fn().mockResolvedValue({ errors: [], saved: 0 }),
  } = options;
  mockState.instance = null;
  mockState.ctorCalls = [];
  const onUserEdit = vi.fn();
  const tableEl = ref<HTMLElement | null>(null);
  const result = useGridEditor({
    tableEl,
    columns: ref(columns),
    data: ref(initialData),
    onSave: onSave as any,
    exportFilename: 'test-export.csv',
    normalizeRow: options.normalizeRow,
    onUserEdit,
    pasteParser: options.pasteParser,
  });
  const el = document.createElement('div');
  document.body.append(el);
  tableEl.value = el;
  await nextTick();
  const mockTab = mockState.instance;
  if (!mockTab) {
    throw new Error('the composable did not create a Tabulator');
  }
  return { result, mockTab, el, onSave, onUserEdit };
}

// ── Test columns matching the compliance and invite shapes ──
const TEST_COLUMNS: Array<Data> = [
  { field: '__select', clipboard: false, headerSort: false },
  { field: 'categoryCode', title: 'Category Code', editor: 'list' },
  { field: 'issue', title: 'Issue', editor: 'input' },
  { field: 'riskLevel', title: 'Risk Level', editor: 'list' },
];

const INVITE_COLUMNS: Array<Data> = [
  { field: 'status', title: 'Status', frozen: true, clipboard: false },
  { field: '__select', clipboard: false },
  { field: 'email', title: 'Email', editor: 'input' },
  { field: 'firstName', title: 'First Name', editor: 'input' },
  { field: 'id', editor: 'input', editable: false, visible: false },
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

describe('clearRangeCells', () => {
  // The row hands out a fresh cell on every lookup, as Tabulator does after a
  // row re-render; clears land on `row.cleared` by field.
  const row = {
    validate: vi.fn(),
    cleared: [] as Array<string>,
    getCell(field: string) {
      return { setValue: () => row.cleared.push(field) };
    },
  };
  function cell(def: Record<string, unknown>, value: unknown) {
    return {
      getColumn: () => ({ getDefinition: () => def }),
      getValue: () => value,
      getRow: () => row,
    };
  }

  it('clears only editable, non-empty cells and leaves read-only columns untouched', () => {
    const status = cell({ field: 'status' }, 'Ready');
    const select = cell({ field: '__select', formatter: 'rowSelection' }, true);
    const email = cell({ field: 'email', editor: 'input' }, 'a@acme.com');
    const locked = cell({ field: 'id', editor: 'input', editable: false }, 'x');
    const empty = cell({ field: 'role', editor: 'list' }, '');
    const tab = {
      getRanges: () => [
        { getCells: () => [[status, select, email, locked, empty]] },
      ],
    };

    expect(clearRangeCells(tab)).toBe(1);
    expect(row.cleared).toEqual(['email']);
    expect(row.validate).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// useGridEditor — composable tests over the mock Tabulator
// ═══════════════════════════════════════════════════════════════════════════

describe('useGridEditor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('initializes the Tabulator when tableEl is set, rowCount reflects data', async () => {
    const initialData = [
      { id: 'r1', issue: 'Row 1' },
      { id: 'r2', issue: 'Row 2' },
      { id: 'r3', issue: 'Row 3' },
    ];
    const { result, mockTab } = await setupGridEditor({ initialData });

    expect(mockState.ctorCalls).toHaveLength(1);
    expect(mockState.ctorCalls[0].opts.data).toEqual(initialData);
    expect(result.tabulator.value).toBe(mockTab);
    expect(result.rowCount.value).toBe(3);
  });

  it('gives a row loaded without an id a fresh one', async () => {
    const { mockTab } = await setupGridEditor({
      initialData: [{ issue: 'no id' }],
    });
    expect(mockTab._getData()[0].id).toHaveLength(36);
  });

  it('Tabulator is initialized with the expected options', async () => {
    await setupGridEditor({ columns: TEST_COLUMNS });
    const opts = mockState.ctorCalls[0].opts;
    // Paste is the composable's own listener; Tabulator only copies.
    expect(opts.clipboard).toBe('copy');
    expect(opts.clipboardCopyRowRange).toBe('range');
    expect(opts.validationMode).toBe('highlight');
    expect(opts.layout).toBe('fitDataFill');
    expect(opts.headerSortClickElement).toBe('icon');
    expect(opts).toHaveProperty('selectableRows', undefined);
    expect(opts.selectableRange).toBe(true);
    expect(opts.selectableRangeInitializeDefault).toBe(false);
    expect(opts.selectableRangeFill).toBe(true);
    expect(opts.movableColumns).toBe(true);
    expect(opts.editTriggerEvent).toBe('dblclick');
    expect(opts.reactiveData).toBe(true);
    expect(opts.height).toBe('100%');
    expect(opts).not.toHaveProperty('history');
  });

  // ── Derived dirty state ──

  it('counts an edited row once and reports it to onUserEdit', async () => {
    const { result, mockTab, onUserEdit } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'old' }],
    });
    expect(result.dirtyCount.value).toBe(0);

    typeInto(mockTab, 'r1', 'issue', 'new');
    typeInto(mockTab, 'r1', 'issue', 'newer');

    expect(result.dirtyCount.value).toBe(1);
    expect(onUserEdit.mock.calls).toEqual([[['r1']], [['r1']]]);
  });

  it('an edit reverted by hand is not a change', async () => {
    const { result, mockTab } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'old' }],
    });
    typeInto(mockTab, 'r1', 'issue', 'new');
    expect(result.dirtyCount.value).toBe(1);

    typeInto(mockTab, 'r1', 'issue', 'old');
    expect(result.dirtyCount.value).toBe(0);
  });

  it('runs normalizeRow on a typed edit', async () => {
    const { mockTab } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'old' }],
      normalizeRow: (row) => ({ ...row, issue: String(row.issue).trim() }),
    });
    typeInto(mockTab, 'r1', 'issue', '  padded  ');
    expect(mockTab._getData()[0].issue).toBe('padded');
  });

  // ── Add Row ──

  it('handleAddRow adds a row with a UUID at the top, dirty and reported', async () => {
    const { result, mockTab, onUserEdit } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'existing' }],
    });

    result.handleAddRow();

    expect(result.rowCount.value).toBe(2);
    expect(result.dirtyCount.value).toBe(1);
    const id = mockTab._getData()[0].id;
    expect(id).toHaveLength(36);
    expect(onUserEdit).toHaveBeenCalledWith([id]);
  });

  // ── Paste ──

  it('a paste with no cell selected appends positional rows with fresh ids', async () => {
    const { result, mockTab, el, onUserEdit } = await setupGridEditor({
      initialData: [{ id: 'r1', categoryCode: 'A', issue: 'kept' }],
      columns: TEST_COLUMNS,
      normalizeRow: (row) => ({ ...row, normalized: true }),
    });

    const event = paste(el, 'B\tIssue B\tHigh\nC\tIssue C\tLow\n');

    expect(event.defaultPrevented).toBe(true);
    const data = mockTab._getData();
    expect(data).toHaveLength(3);
    expect(data[1]).toMatchObject({
      categoryCode: 'B',
      issue: 'Issue B',
      riskLevel: 'High',
      normalized: true,
    });
    expect(data[1].__select).toBeUndefined();
    expect(data[1].id).not.toBe(data[2].id);
    expect(result.dirtyCount.value).toBe(2);
    expect(onUserEdit).toHaveBeenCalledTimes(1);
    expect(onUserEdit).toHaveBeenCalledWith([data[1].id, data[2].id]);
    expect(mockTab._row(String(data[1].id)).validate).toHaveBeenCalled();
  });

  it('the append path goes through pasteParser; [] adds nothing', async () => {
    const pasteParser = vi.fn(() => []);
    const { mockTab, el, onUserEdit } = await setupGridEditor({
      columns: TEST_COLUMNS,
      pasteParser,
    });

    paste(el, 'Email\tName\nann@acme.com\tAnn');

    expect(pasteParser).toHaveBeenCalledWith(
      'Email\tName\nann@acme.com\tAnn',
      expect.any(Function),
    );
    expect(mockTab._getData()).toEqual([]);
    expect(onUserEdit).toHaveBeenCalledWith([]);
  });

  it('a paste with a cell selected writes over it, skipping read-only columns, and adds overflow rows', async () => {
    const pasteParser = vi.fn(() => []);
    const { result, mockTab, el, onUserEdit } = await setupGridEditor({
      initialData: [
        { id: 'a', email: 'a@acme.com', firstName: 'Ann' },
        { id: 'b', email: 'b@acme.com', firstName: 'Bo' },
      ],
      columns: INVITE_COLUMNS,
      pasteParser,
    });
    mockTab._setRange([[['b', 'status']]]);

    paste(el, 'x@acme.com\tXavier\ny@acme.com\tYan\n');

    const data = mockTab._getData();
    expect(pasteParser).not.toHaveBeenCalled();
    expect(data[0]).toEqual({ id: 'a', email: 'a@acme.com', firstName: 'Ann' });
    expect(data[1]).toEqual({
      id: 'b',
      email: 'x@acme.com',
      firstName: 'Xavier',
    });
    expect(data).toHaveLength(3);
    expect(data[2]).toMatchObject({ email: 'y@acme.com', firstName: 'Yan' });
    expect(data[2]).not.toHaveProperty('status');
    expect(result.dirtyCount.value).toBe(2);
    expect(onUserEdit).toHaveBeenCalledTimes(1);
    expect(onUserEdit).toHaveBeenCalledWith(['b', data[2].id]);
  });

  it('a paste over a hidden column skips it', async () => {
    const { result, mockTab, el } = await setupGridEditor({
      initialData: [
        { id: 'r1', categoryCode: 'A', issue: 'i', riskLevel: 'High' },
      ],
      columns: TEST_COLUMNS,
    });
    result.setColumnVisible('issue', false);
    mockTab._setRange([[['r1', 'categoryCode']]]);

    paste(el, 'B\tLow');

    expect(mockTab._getData()[0]).toMatchObject({
      categoryCode: 'B',
      issue: 'i',
      riskLevel: 'Low',
    });
  });

  it('deleting the active cell’s row moves it to the row now in its place', async () => {
    const { result, mockTab, el } = await setupGridEditor({
      initialData: [
        { id: 'r1', issue: 'one' },
        { id: 'r2', issue: 'two' },
        { id: 'r3', issue: 'three' },
      ],
    });
    mockTab._setRange([[['r2', 'issue']]]);
    mockTab._select(['r2']);
    result.handleDeleteSelected();

    paste(el, 'pasted');

    expect(mockTab._getData().map((r) => r.issue)).toEqual(['one', 'pasted']);
  });

  it('Escape drops the selection, so the next paste appends', async () => {
    const { mockTab, el } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'kept' }],
    });
    mockTab._setRange([[['r1', 'issue']]]);

    key({ key: 'Escape' }, el);
    paste(el, 'new');

    expect(mockTab._getData().map((r) => r.issue)).toEqual(['kept', 'new']);
  });

  it('a paste into a header filter or editor is left alone', async () => {
    const { mockTab, el } = await setupGridEditor();
    const input = document.createElement('input');
    el.append(input);

    const event = paste(el, 'x', input);

    expect(event.defaultPrevented).toBe(false);
    expect(mockTab._getData()).toEqual([]);
  });

  // ── Range clear ──

  it('Delete clears the range as one change reported once', async () => {
    const { result, mockTab, el, onUserEdit } = await setupGridEditor({
      initialData: [
        { id: 'r1', issue: 'one', riskLevel: 'High' },
        { id: 'r2', issue: 'two', riskLevel: 'Low' },
      ],
      columns: TEST_COLUMNS,
    });
    mockTab._setRange([
      [
        ['r1', 'issue'],
        ['r1', 'riskLevel'],
      ],
      [
        ['r2', 'issue'],
        ['r2', 'riskLevel'],
      ],
    ]);

    key({ key: 'Delete' }, el);

    expect(mockTab._getData()).toEqual([
      { id: 'r1', issue: null, riskLevel: null },
      { id: 'r2', issue: null, riskLevel: null },
    ]);
    expect(result.dirtyCount.value).toBe(2);
    expect(onUserEdit).toHaveBeenCalledTimes(1);
    expect(onUserEdit).toHaveBeenCalledWith(['r1', 'r2']);

    await result.undo();
    expect(mockTab._getData()[1]).toEqual({
      id: 'r2',
      issue: 'two',
      riskLevel: 'Low',
    });
  });

  // ── Fill handle ──

  it('a fill is one change: normalized, reported once, undone in one step', async () => {
    const { result, mockTab, onUserEdit } = await setupGridEditor({
      initialData: [
        { id: 'r1', issue: 'src' },
        { id: 'r2', issue: 'a' },
        { id: 'r3', issue: 'b' },
      ],
      normalizeRow: (row) => ({
        ...row,
        issue: String(row.issue).toUpperCase(),
      }),
    });
    // Tabulator's Range.setData writes the cells, then fires rangeEdited.
    const modified = ['r2', 'r3'].map((id) => {
      mockTab._row(id).getData().issue = 'src';
      return mockTab._row(id).getCell('issue');
    });
    mockTab._emit('rangeEdited', { getModifiedCells: () => modified });

    expect(mockTab._getData().map((r) => r.issue)).toEqual([
      'src',
      'SRC',
      'SRC',
    ]);
    expect(result.dirtyCount.value).toBe(2);
    expect(onUserEdit).toHaveBeenCalledTimes(1);
    expect(onUserEdit).toHaveBeenCalledWith(['r2', 'r3']);

    await result.undo();
    expect(mockTab._getData().map((r) => r.issue)).toEqual(['src', 'a', 'b']);
    expect(result.dirtyCount.value).toBe(0);
  });

  // ── Undo / redo ──

  it('undo and redo an edit, reporting the row each time', async () => {
    const { result, mockTab, onUserEdit } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'old' }],
    });
    typeInto(mockTab, 'r1', 'issue', 'new');
    onUserEdit.mockClear();

    await result.undo();
    expect(mockTab._getData()[0].issue).toBe('old');
    expect(result.dirtyCount.value).toBe(0);
    expect(onUserEdit).toHaveBeenCalledWith(['r1']);

    await result.redo();
    expect(mockTab._getData()[0].issue).toBe('new');
    expect(result.dirtyCount.value).toBe(1);
    expect(onUserEdit).toHaveBeenCalledTimes(2);
  });

  it('a new write after an undo empties the redo stack', async () => {
    const { result, mockTab } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'old' }],
    });
    typeInto(mockTab, 'r1', 'issue', 'one');
    await result.undo();
    typeInto(mockTab, 'r1', 'issue', 'two');

    await result.redo();
    expect(mockTab._getData()[0].issue).toBe('two');
  });

  it('undo of Add Row and Delete restores the rows and keeps other ticks', async () => {
    const { result, mockTab } = await setupGridEditor({
      initialData: [
        { id: 'r1', issue: 'one' },
        { id: 'r2', issue: 'two' },
        { id: 'r3', issue: 'three' },
      ],
    });
    mockTab._select(['r1', 'r3']);
    result.handleDeleteSelected();
    mockTab._select([]);
    result.handleAddRow();
    expect(result.rowCount.value).toBe(2);

    await result.undo();
    expect(mockTab._getData().map((r) => r.id)).toEqual(['r2']);
    await result.undo();
    expect(mockTab._getData().map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(result.dirtyCount.value).toBe(0);
  });

  it('undo of Clear brings every row back', async () => {
    const { result, mockTab } = await setupGridEditor({
      initialData: [
        { id: 'r1', issue: 'one' },
        { id: 'r2', issue: 'two' },
      ],
    });
    result.clearGrid();
    expect(result.rowCount.value).toBe(0);

    await result.undo();
    expect(mockTab._getData()).toEqual([
      { id: 'r1', issue: 'one' },
      { id: 'r2', issue: 'two' },
    ]);
    expect(result.dirtyCount.value).toBe(0);
  });

  it('an agent write empties both stacks', async () => {
    const { result, mockTab, onUserEdit } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'old' }],
    });
    typeInto(mockTab, 'r1', 'issue', 'person');
    await result.undo();
    typeInto(mockTab, 'r1', 'issue', 'person again');
    await result.updateRows([{ id: 'r1', issue: 'agent' }]);
    onUserEdit.mockClear();

    await result.undo();
    await result.redo();

    expect(mockTab._getData()[0].issue).toBe('agent');
    expect(onUserEdit).not.toHaveBeenCalled();
  });

  it('⌘Z, ⌘⇧Z and Ctrl+Y work from anywhere but a control or a dialog', async () => {
    const { mockTab } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'old' }],
    });
    typeInto(mockTab, 'r1', 'issue', 'new');

    const input = document.createElement('input');
    document.body.append(input);
    key({ key: 'z', metaKey: true }, input);
    await flush();
    expect(mockTab._getData()[0].issue).toBe('new');

    key({ key: 'z', metaKey: true });
    await flush();
    expect(mockTab._getData()[0].issue).toBe('old');

    key({ key: 'Z', metaKey: true, shiftKey: true });
    await flush();
    expect(mockTab._getData()[0].issue).toBe('new');

    key({ key: 'z', ctrlKey: true });
    await flush();
    key({ key: 'y', ctrlKey: true });
    await flush();
    expect(mockTab._getData()[0].issue).toBe('new');

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    key({ key: 'z', metaKey: true });
    await flush();
    expect(mockTab._getData()[0].issue).toBe('new');
  });

  // ── Save loop ──

  it('handleSave short-circuits with no dirty rows', async () => {
    const { result, onSave } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'clean' }],
    });

    await result.handleSave();
    expect(onSave).not.toHaveBeenCalled();
    expect(result.saveResult.value).toEqual({ errors: [], saved: 0 });
    expect(result.isSaving.value).toBe(false);
  });

  it('handleSave sends the diff as {upserts, deletes} and re-baselines on success', async () => {
    const onSave = vi.fn().mockResolvedValue({ errors: [], saved: 3 });
    const { result, mockTab } = await setupGridEditor({
      initialData: [
        { id: 'r1', issue: 'old' },
        { id: 'r2', issue: 'gone' },
      ],
      onSave,
    });
    typeInto(mockTab, 'r1', 'issue', 'updated');
    mockTab._select(['r2']);
    result.handleDeleteSelected();
    result.handleAddRow();
    const added = mockTab._getData()[0];

    await result.handleSave();

    expect(onSave).toHaveBeenCalledWith({
      upserts: [added, { id: 'r1', issue: 'updated' }],
      deletes: ['r2'],
    });
    expect(result.saveResult.value).toEqual({ errors: [], saved: 3 });
    expect(result.dirtyCount.value).toBe(0);
    expect(result.isSaving.value).toBe(false);
  });

  it('an edit made while the save is in flight stays dirty', async () => {
    const pending = Promise.withResolvers<unknown>();
    const onSave = vi.fn(() => pending.promise);
    const { result, mockTab } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'old' }],
      onSave,
    });
    typeInto(mockTab, 'r1', 'issue', 'sent');
    const saving = result.handleSave();
    typeInto(mockTab, 'r1', 'issue', 'later');
    pending.resolve({ errors: [], saved: 1 });
    await saving;

    expect(result.dirtyCount.value).toBe(1);
  });

  it('handleSave populates errorList and highlights cells on errors', async () => {
    const errors = [
      { row: 0, rowId: 'r1', field: 'issue', message: 'issue is required' },
    ];
    const onSave = vi.fn().mockResolvedValue({ errors, saved: 0 });
    const { result, mockTab } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'x' }],
      onSave,
    });
    typeInto(mockTab, 'r1', 'issue', '');

    await result.handleSave();

    expect(result.errorList.value).toEqual(errors);
    expect(result.saveResult.value).toEqual({ errors, saved: 0 });
    expect(
      mockTab._row('r1').getCell('issue').element.classList.add,
    ).toHaveBeenCalledWith('backend-validation-error');
    expect(result.dirtyCount.value).toBe(1);
  });

  it('handleSave rejection produces a synthetic error entry', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Network failure'));
    const { result, mockTab } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'old' }],
      onSave,
    });
    typeInto(mockTab, 'r1', 'issue', 'updated');

    await result.handleSave();

    expect(result.saveResult.value).toEqual({
      errors: [{ row: 0, rowId: '', field: 'network', message: 'Save failed' }],
      saved: 0,
    });
    expect(result.isSaving.value).toBe(false);
  });

  it('handleSave is guarded against double-click (isSaving guard)', async () => {
    const pending = Promise.withResolvers<unknown>();
    const onSave = vi.fn(() => pending.promise);
    const { result, mockTab } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'old' }],
      onSave,
    });
    typeInto(mockTab, 'r1', 'issue', 'updated');

    const savePromise1 = result.handleSave();
    expect(result.isSaving.value).toBe(true);
    await result.handleSave();
    expect(onSave).toHaveBeenCalledTimes(1);

    pending.resolve({ errors: [], saved: 1 });
    await savePromise1;
    expect(result.isSaving.value).toBe(false);
  });

  // ── VAL-GRID-029: "Saved N" badge clears when a new change occurs ──

  it('clears saveResult when a new edit follows a successful save', async () => {
    const onSave = vi.fn().mockResolvedValue({ errors: [], saved: 1 });
    const { result, mockTab } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'old' }],
      onSave,
    });
    typeInto(mockTab, 'r1', 'issue', 'first');
    await result.handleSave();
    expect(result.saveResult.value).toEqual({ errors: [], saved: 1 });

    typeInto(mockTab, 'r1', 'issue', 'second');
    await nextTick();

    expect(result.dirtyCount.value).toBe(1);
    expect(result.saveResult.value).toBeNull();
  });

  it('clears saveResult when a new row is added after a successful save', async () => {
    const onSave = vi.fn().mockResolvedValue({ errors: [], saved: 1 });
    const { result, mockTab } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'old' }],
      onSave,
    });
    typeInto(mockTab, 'r1', 'issue', 'updated');
    await result.handleSave();

    result.handleAddRow();
    await nextTick();

    expect(result.dirtyCount.value).toBe(1);
    expect(result.saveResult.value).toBeNull();
  });

  it('does not clear saveResult when nothing changes after the save', async () => {
    const onSave = vi.fn().mockResolvedValue({ errors: [], saved: 1 });
    const { result, mockTab } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'old' }],
      onSave,
    });
    typeInto(mockTab, 'r1', 'issue', 'updated');
    await result.handleSave();
    await nextTick();

    expect(result.saveResult.value).toEqual({ errors: [], saved: 1 });
  });

  // ── Error highlighting by rowId (regression guard for f7bd853) ──

  it('error highlighting locates rows by rowId, not by upserts-array index', async () => {
    // The error's `row` (index in the request's upserts) is 0, but its rowId
    // points to added-2. Using `err.row` would highlight seed-1.
    const { result, mockTab } = await setupGridEditor({
      initialData: [
        { id: 'seed-1', issue: 'valid seeded row' },
        { id: 'added-1', issue: 'x' },
        { id: 'added-2', issue: 'x' },
      ],
      onSave: vi.fn().mockResolvedValue({
        errors: [
          { row: 0, rowId: 'added-2', field: 'issue', message: 'Required' },
        ],
        saved: 0,
      }),
    });
    typeInto(mockTab, 'added-2', 'issue', '');
    mockTab._select(['added-1']);
    result.handleDeleteSelected();

    await result.handleSave();

    expect(
      mockTab._row('added-2').getCell('issue').element.classList.add,
    ).toHaveBeenCalledWith('backend-validation-error');
    expect(mockTab._row('seed-1').getCell).not.toHaveBeenCalledWith('issue');
  });

  // ── scrollToError ──

  it('scrollToError scrolls to the row matching rowId and flashes the cell', async () => {
    const { result, mockTab } = await setupGridEditor({
      initialData: [
        { id: 'r1', issue: 'first' },
        { id: 'r2', issue: 'second' },
      ],
    });

    result.scrollToError({
      row: 0,
      rowId: 'r2',
      field: 'issue',
      message: 'bad',
    });

    expect(mockTab._row('r2').scrollTo).toHaveBeenCalled();
    expect(mockTab._row('r2').getCell('issue').element.style.outline).toBe(
      '3px solid #ef4444',
    );
  });

  it('scrollToError does nothing if the rowId is not found (deleted row)', async () => {
    const { result } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'first' }],
    });
    expect(() =>
      result.scrollToError({
        row: 0,
        rowId: 'nonexistent',
        field: 'issue',
        message: 'bad',
      }),
    ).not.toThrow();
  });

  // ── Delete selected ──

  it('handleDeleteSelected removes ticked rows, counts saved ones and reports them', async () => {
    const { result, mockTab, onUserEdit } = await setupGridEditor({
      initialData: [
        { id: 'r1', issue: 'first' },
        { id: 'r2', issue: 'second' },
        { id: 'r3', issue: 'third' },
      ],
    });
    mockTab._select(['r1', 'r3']);

    result.handleDeleteSelected();

    expect(mockTab._getData().map((r) => r.id)).toEqual(['r2']);
    expect(result.rowCount.value).toBe(1);
    expect(result.dirtyCount.value).toBe(2);
    expect(onUserEdit).toHaveBeenCalledWith(['r1', 'r3']);
  });

  it('handleDeleteSelected does nothing when no rows are selected', async () => {
    const { result, mockTab } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'first' }],
    });

    result.handleDeleteSelected();

    expect(mockTab._getData()).toHaveLength(1);
    expect(result.dirtyCount.value).toBe(0);
  });

  // ── VAL-CUSTOM-018: deleting a row with an error drops its sidebar entry ──

  async function withTwoErrors() {
    const errors = [
      { row: 0, rowId: 'r1', field: 'issue', message: 'required' },
      { row: 1, rowId: 'r2', field: 'issue', message: 'required' },
    ];
    const setup = await setupGridEditor({
      initialData: [
        { id: 'r1', issue: 'x' },
        { id: 'r2', issue: 'x' },
        { id: 'r3', issue: 'ok' },
      ],
      onSave: vi.fn().mockResolvedValue({ errors, saved: 0 }),
    });
    typeInto(setup.mockTab, 'r1', 'issue', '');
    typeInto(setup.mockTab, 'r2', 'issue', '');
    await setup.result.handleSave();
    expect(setup.result.errorList.value).toHaveLength(2);
    return setup;
  }

  it('handleDeleteSelected removes error sidebar entries for deleted rows', async () => {
    const { result, mockTab } = await withTwoErrors();
    mockTab._select(['r1']);
    result.handleDeleteSelected();
    expect(result.errorList.value.map((e) => e.rowId)).toEqual(['r2']);
  });

  it('handleDeleteSelected removes all matching error entries', async () => {
    const { result, mockTab } = await withTwoErrors();
    mockTab._select(['r1', 'r2']);
    result.handleDeleteSelected();
    expect(result.errorList.value).toEqual([]);
  });

  it('handleDeleteSelected leaves other rows’ error entries intact', async () => {
    const { result, mockTab } = await withTwoErrors();
    mockTab._select(['r3']);
    result.handleDeleteSelected();
    expect(result.errorList.value.map((e) => e.rowId)).toEqual(['r1', 'r2']);
  });

  // ── Clear grid (VAL-CUSTOM-040 / VAL-GRID-023) ──

  it('clearGrid empties data and clears errors and the save result', async () => {
    const { result, mockTab } = await withTwoErrors();

    result.clearGrid();

    expect(mockTab._getData()).toHaveLength(0);
    expect(result.rowCount.value).toBe(0);
    expect(result.errorList.value).toEqual([]);
    expect(result.saveResult.value).toBeNull();
  });

  it('clearGrid counts every saved row as a delete, so Save stays enabled', async () => {
    const { result } = await setupGridEditor({
      initialData: [
        { id: 'r1', issue: 'first' },
        { id: 'r2', issue: 'second' },
      ],
    });
    result.clearGrid();
    expect(result.dirtyCount.value).toBe(2);
  });

  it('clearGrid drops rows added since the last save (nothing to delete)', async () => {
    const { result } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'saved row' }],
    });
    result.handleAddRow();
    expect(result.dirtyCount.value).toBe(1);

    result.clearGrid();
    expect(result.dirtyCount.value).toBe(1);
  });

  it('after clearGrid, the save sends every saved row id in deletes', async () => {
    const onSave = vi.fn().mockResolvedValue({ errors: [], saved: 2 });
    const { result } = await setupGridEditor({
      initialData: [
        { id: 'r1', issue: 'first' },
        { id: 'r2', issue: 'second' },
      ],
      onSave,
    });
    result.clearGrid();

    await result.handleSave();

    expect(onSave).toHaveBeenCalledWith({ upserts: [], deletes: ['r1', 'r2'] });
  });

  it('after clearGrid on an empty grid, dirtyCount stays 0', async () => {
    const { result } = await setupGridEditor({ initialData: [] });
    result.clearGrid();
    expect(result.dirtyCount.value).toBe(0);
  });

  // ── Programmatic API ──

  it('agent writes are dirty and validated but not reported as person edits', async () => {
    const { result, mockTab, onUserEdit } = await setupGridEditor({
      initialData: [{ id: 'r1', issue: 'old' }],
    });

    const [id] = await result.addRows([{ issue: 'agent row', id: 'ignored' }]);
    const updated = await result.updateRows([
      { id: 'r1', issue: 'agent edit' },
      { id: 'nope', issue: 'x' },
    ]);

    expect(id).not.toBe('ignored');
    expect(updated).toEqual({ updated: ['r1'], missing: ['nope'] });
    expect(mockTab._row('r1').validate).toHaveBeenCalled();
    expect(result.dirtyCount.value).toBe(2);
    expect(result.deleteRows([id, 'nope'])).toEqual({
      deleted: [id],
      missing: ['nope'],
    });
    expect(result.dirtyCount.value).toBe(1);
    expect(onUserEdit).not.toHaveBeenCalled();
  });

  // ── Columns ──

  it('the column menu lists visible data columns; Status is locked', async () => {
    const { result } = await setupGridEditor({ columns: INVITE_COLUMNS });
    expect(result.columnItems.value).toEqual([
      { id: 'status', title: 'Status', visible: true, locked: true },
      { id: 'email', title: 'Email', visible: true, locked: false },
      { id: 'firstName', title: 'First Name', visible: true, locked: false },
    ]);
  });

  it('setColumnVisible hides and shows the column', async () => {
    const { result, mockTab } = await setupGridEditor({
      columns: INVITE_COLUMNS,
    });

    result.setColumnVisible('email', false);
    expect(mockTab.getColumn('email')?.hide).toHaveBeenCalled();
    expect(result.columnItems.value[1].visible).toBe(false);

    result.setColumnVisible('email', true);
    expect(mockTab.getColumn('email')?.show).toHaveBeenCalled();
    expect(result.columnItems.value[1].visible).toBe(true);
  });

  it('a column dragged before the checkbox column puts the checkbox back first', async () => {
    const { mockTab } = await setupGridEditor({ columns: TEST_COLUMNS });

    mockTab._moveColumnToFront('issue');
    mockTab._emit('columnMoved');

    expect(mockTab._fieldOrder()).toEqual([
      '__select',
      'issue',
      'categoryCode',
      'riskLevel',
    ]);
  });

  it('a frozen Status column stays first, the checkbox right after it', async () => {
    const { mockTab } = await setupGridEditor({ columns: INVITE_COLUMNS });
    mockTab._emit('columnMoved');
    expect(mockTab._fieldOrder().slice(0, 2)).toEqual(['status', '__select']);
  });

  // ── Export CSV (VAL-GRID-022: all rows regardless of filters) ──

  it('handleExportCSV downloads every row as CSV under the export filename', async () => {
    const { result, mockTab } = await setupGridEditor();
    result.handleExportCSV();
    expect(mockTab.download).toHaveBeenCalledWith(
      'csv',
      'test-export.csv',
      { delimiter: ',' },
      'all',
    );
  });

  it('handleExportCSV unwraps a ref exportFilename', async () => {
    const tableEl = ref<HTMLElement | null>(null);
    const result = useGridEditor({
      tableEl,
      columns: ref([{ field: 'issue', editor: 'input' }]),
      data: ref([]),
      onSave: vi.fn() as any,
      exportFilename: ref('dynamic-name.csv'),
    });
    tableEl.value = document.createElement('div');
    await nextTick();

    result.handleExportCSV();

    expect(mockState.instance?.download).toHaveBeenCalledWith(
      'csv',
      'dynamic-name.csv',
      { delimiter: ',' },
      'all',
    );
  });
});
