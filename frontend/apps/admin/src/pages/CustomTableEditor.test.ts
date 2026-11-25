import { mount, flushPromises } from '@vue/test-utils';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vite-plus/test';
import { defineComponent, h, type VNode } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import CustomTableEditor from './CustomTableEditor';
import type { TableDefinition, TableRow } from 'src/types/customTable';

// ── Stub GridEditor ──
// The real GridEditor imports Tabulator, which must never be loaded in a unit
// test. The stub surfaces the props the page passes (title, columns, data,
// exportFilename) as data attributes so the tests can assert on them without
// driving the real grid engine. It also stashes the onSave callback into the
// hoisted `saveCapture` object on mount, so save-path tests can invoke the
// handler directly. It renders the toolbarActions render prop so the Add
// Column button (supplied by the editor page) is present in the test tree.
const saveCapture = vi.hoisted(() => ({ onSave: null as any }));

vi.mock('components/GridEditor', () => ({
  default: defineComponent({
    name: 'GridEditor',
    props: {
      columns: {
        type: Array as () => Array<Record<string, unknown>>,
        required: true,
      },
      data: {
        type: Array as () => Array<Record<string, unknown>>,
        required: true,
      },
      onSave: { type: Function, required: true },
      title: { type: String, required: true },
      exportFilename: { type: String, required: true },
      toolbarActions: { type: Function, default: undefined },
    },
    setup(props) {
      // Stash the onSave callback so save-path tests can call it directly.
      saveCapture.onSave = props.onSave as typeof saveCapture.onSave;
      return (): VNode =>
        h(
          'div',
          {
            'data-test': 'grid-editor',
            'data-title': props.title,
            'data-export-filename': props.exportFilename,
            'data-row-count': String(props.data.length),
          },
          [
            h(
              'div',
              { 'data-test': 'column-fields' },
              (props.columns as Array<Record<string, unknown>>)
                .map((c) => String(c.field))
                .join(','),
            ),
            // Render the toolbarActions render prop so the Add Column button
            // supplied by the editor page is present in the test tree.
            props.toolbarActions ? props.toolbarActions() : null,
          ],
        );
    },
  }),
}));

// ── Stub Nuxt UI components ──
// The real UButton injects a vue-router route location under vitest that
// does not resolve. Mock it with a plain button that forwards clicks.
vi.mock('@nuxt/ui/components/Button.vue', () => ({
  default: defineComponent({
    name: 'UButton',
    props: {
      label: { type: String, default: '' },
      color: { type: String, default: '' },
      variant: { type: String, default: '' },
      size: { type: String, default: '' },
    },
    emits: ['click'],
    setup(props, { emit }) {
      return (): VNode =>
        h(
          'button',
          {
            class: 'u-button',
            'data-label': props.label,
            onClick: () => emit('click'),
          },
          props.label,
        );
    },
  }),
}));

vi.mock('@nuxt/ui/components/Input.vue', () => ({
  default: defineComponent({
    name: 'UInput',
    props: {
      modelValue: { type: String, default: '' },
      placeholder: { type: String, default: '' },
      type: { type: String, default: 'text' },
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return (): VNode =>
        h('input', {
          class: 'u-input',
          type: props.type,
          value: props.modelValue,
          placeholder: props.placeholder,
          'data-model': props.modelValue,
          onInput: (e: Event) =>
            emit('update:modelValue', (e.target as HTMLInputElement).value),
        });
    },
  }),
}));

vi.mock('@nuxt/ui/components/Select.vue', () => ({
  default: defineComponent({
    name: 'USelect',
    props: {
      modelValue: { type: [String, Number, Boolean], default: '' },
      items: {
        type: Array as () => Array<unknown>,
        default: (): Array<unknown> => [],
      },
      placeholder: { type: String, default: '' },
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return (): VNode => {
        const items = (props.items as Array<unknown>).map((item) => {
          if (typeof item === 'object' && item !== null) {
            return {
              label: (item as Record<string, unknown>).label as string,
              value: (item as Record<string, unknown>).value as string,
            };
          }
          return { label: String(item), value: String(item) };
        });
        return h(
          'select',
          {
            class: 'u-select',
            value: props.modelValue,
            'data-model': String(props.modelValue),
            onChange: (e: Event) =>
              emit('update:modelValue', (e.target as HTMLSelectElement).value),
          },
          items.map((item) => h('option', { value: item.value }, item.label)),
        );
      };
    },
  }),
}));

vi.mock('@nuxt/ui/components/Checkbox.vue', () => ({
  default: defineComponent({
    name: 'UCheckbox',
    props: {
      modelValue: { type: [Boolean, String], default: false },
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return (): VNode =>
        h('input', {
          class: 'u-checkbox',
          type: 'checkbox',
          checked: !!props.modelValue,
          'data-model': String(props.modelValue),
          onChange: (e: Event) =>
            emit('update:modelValue', (e.target as HTMLInputElement).checked),
        });
    },
  }),
}));

vi.mock('@nuxt/ui/components/Modal.vue', () => ({
  default: defineComponent({
    name: 'UModal',
    props: {
      open: { type: Boolean, default: false },
      title: { type: String, default: '' },
      description: { type: String, default: '' },
    },
    emits: ['update:open'],
    setup(props, { slots }) {
      return (): VNode =>
        props.open
          ? h('div', { class: 'u-modal', 'data-test': 'add-column-modal' }, [
              h('h3', {}, props.title),
              slots.body ? slots.body() : null,
              slots.footer ? slots.footer() : null,
            ])
          : h('div', { class: 'u-modal u-modal--closed' });
    },
  }),
}));

// ── Fixtures ──

const VALID_UUID_A = '11111111-1111-4111-8111-111111111111';
const VALID_UUID_B = '22222222-2222-4222-8222-222222222222';
const COL_UUID_1 = '44444444-4444-4444-8444-444444444444';
const COL_UUID_2 = '55555555-5555-4555-8555-555555555555';
const COL_UUID_3 = '66666666-6666-4666-8666-666666666666';
const VALID_ISO = '2026-08-11T12:00:00.000Z';

function makeDef(over: Partial<TableDefinition> = {}): TableDefinition {
  return {
    id: VALID_UUID_A,
    name: 'Test Table',
    columns: [
      {
        id: COL_UUID_1,
        name: 'Title',
        type: 'text',
        required: true,
        choices: [],
      },
      {
        id: COL_UUID_2,
        name: 'Score',
        type: 'number',
        required: false,
        choices: [],
      },
      {
        id: COL_UUID_3,
        name: 'Status',
        type: 'dropdown',
        required: true,
        choices: ['Open', 'Closed'],
      },
    ],
    createdAt: VALID_ISO,
    updatedAt: VALID_ISO,
    ...over,
  };
}

function makeRow(over: Record<string, unknown> = {}): TableRow {
  return {
    id: crypto.randomUUID(),
    createdAt: VALID_ISO,
    updatedAt: VALID_ISO,
    ...over,
  };
}

// ── Router + mount helper ──
// createMemoryHistory avoids touching the real browser history. The router
// resolves /custom/:tableId synchronously so the editor mounts on the first
// tick. A /custom stub route is included so the not-found back-link has a
// destination the tests can assert against.

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/custom/:tableId', component: CustomTableEditor },
      {
        path: '/custom',
        component: defineComponent({
          name: 'ListStub',
          setup: () => (): VNode => h('div', { 'data-test': 'list' }),
        }),
      },
    ],
  });
}

async function mountEditor(tableId: string) {
  const router = makeRouter();
  await router.push(`/custom/${tableId}`);
  await router.isReady();
  const wrapper = mount(CustomTableEditor, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

function seedDef(d: TableDefinition) {
  const existing = localStorage.getItem('sc-table-defs');
  const list: Array<TableDefinition> = existing ? JSON.parse(existing) : [];
  list.push(d);
  localStorage.setItem('sc-table-defs', JSON.stringify(list));
}

function seedRows(tableId: string, rows: Array<TableRow>) {
  localStorage.setItem(`sc-table-data-${tableId}`, JSON.stringify(rows));
}

let warnSpy: ReturnType<typeof vi.spyOn>;

describe('CustomTableEditor', () => {
  beforeEach(() => {
    localStorage.clear();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('existing table — loading and rendering', () => {
    it('renders the table name as the title', async () => {
      seedDef(makeDef({ name: 'Employee Directory' }));
      const { wrapper } = await mountEditor(VALID_UUID_A);
      const editor = wrapper.find('[data-test="grid-editor"]');
      expect(editor.exists()).toBe(true);
      expect(editor.attributes('data-title')).toBe('Employee Directory');
    });

    it('renders columns in definition order with the checkbox column first', async () => {
      seedDef(makeDef());
      const { wrapper } = await mountEditor(VALID_UUID_A);
      const fields = wrapper.find('[data-test="column-fields"]').text();
      const fieldList = fields.split(',');
      expect(fieldList[0]).toBe('__select');
      expect(fieldList[1]).toBe('Title');
      expect(fieldList[2]).toBe('Score');
      expect(fieldList[3]).toBe('Status');
    });

    it('passes the export filename derived from the table name', async () => {
      seedDef(makeDef({ name: 'Employee Directory' }));
      const { wrapper } = await mountEditor(VALID_UUID_A);
      expect(
        wrapper
          .find('[data-test="grid-editor"]')
          .attributes('data-export-filename'),
      ).toBe('employee-directory.csv');
    });

    it('shows zero rows for a table with no saved data', async () => {
      seedDef(makeDef());
      const { wrapper } = await mountEditor(VALID_UUID_A);
      expect(
        wrapper.find('[data-test="grid-editor"]').attributes('data-row-count'),
      ).toBe('0');
    });

    it('displays saved rows on load', async () => {
      seedDef(makeDef());
      seedRows(VALID_UUID_A, [
        makeRow({ Title: 'Hello', Score: 42, Status: 'Open' }),
        makeRow({ Title: 'World', Score: 99, Status: 'Closed' }),
      ]);
      const { wrapper } = await mountEditor(VALID_UUID_A);
      expect(
        wrapper.find('[data-test="grid-editor"]').attributes('data-row-count'),
      ).toBe('2');
    });
  });

  describe('not-found state', () => {
    it('renders a not-found message for a nonexistent tableId', async () => {
      const { wrapper } = await mountEditor('nonexistent-id');
      expect(wrapper.find('[data-test="grid-editor"]').exists()).toBe(false);
      expect(wrapper.text().toLowerCase()).toContain('not found');
    });

    it('shows a back link to /custom', async () => {
      const { wrapper } = await mountEditor('nonexistent-id');
      const backBtn = wrapper.find('[data-label]');
      expect(backBtn.exists()).toBe(true);
      expect(backBtn.text().toLowerCase()).toMatch(/custom tables/);
    });

    it('clicking the back link navigates to /custom', async () => {
      const { wrapper, router } = await mountEditor('nonexistent-id');
      const backBtn = wrapper.find('[data-label]');
      await backBtn.trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.path).toBe('/custom');
    });

    it('does not render a Tabulator grid', async () => {
      const { wrapper } = await mountEditor('nonexistent-id');
      expect(wrapper.find('.tabulator').exists()).toBe(false);
      expect(wrapper.find('[data-test="grid-editor"]').exists()).toBe(false);
    });
  });

  describe('corruption tolerance', () => {
    it('opens an empty grid for malformed JSON data', async () => {
      seedDef(makeDef());
      localStorage.setItem(`sc-table-data-${VALID_UUID_A}`, '{broken');
      const { wrapper } = await mountEditor(VALID_UUID_A);
      expect(wrapper.find('[data-test="grid-editor"]').exists()).toBe(true);
      expect(
        wrapper.find('[data-test="grid-editor"]').attributes('data-row-count'),
      ).toBe('0');
    });

    it('opens an empty grid for a non-array JSON payload', async () => {
      seedDef(makeDef());
      localStorage.setItem(
        `sc-table-data-${VALID_UUID_A}`,
        '{"not":"an array"}',
      );
      const { wrapper } = await mountEditor(VALID_UUID_A);
      expect(
        wrapper.find('[data-test="grid-editor"]').attributes('data-row-count'),
      ).toBe('0');
    });

    it('drops schema-invalid entries and keeps valid ones', async () => {
      seedDef(makeDef());
      localStorage.setItem(
        `sc-table-data-${VALID_UUID_A}`,
        JSON.stringify([
          {
            id: VALID_UUID_A,
            createdAt: VALID_ISO,
            updatedAt: VALID_ISO,
            Title: 'valid',
          },
          { foo: 'bar' }, // missing id, createdAt, updatedAt
        ]),
      );
      const { wrapper } = await mountEditor(VALID_UUID_A);
      expect(
        wrapper.find('[data-test="grid-editor"]').attributes('data-row-count'),
      ).toBe('1');
    });
  });

  describe('table isolation', () => {
    it('two tables with different definitions show their own columns', async () => {
      const defA = makeDef({
        id: VALID_UUID_A,
        name: 'Table A',
        columns: [
          {
            id: COL_UUID_1,
            name: 'Foo',
            type: 'text',
            required: false,
            choices: [],
          },
          {
            id: COL_UUID_2,
            name: 'Bar',
            type: 'text',
            required: false,
            choices: [],
          },
        ],
      });
      const defB = makeDef({
        id: VALID_UUID_B,
        name: 'Table B',
        columns: [
          {
            id: COL_UUID_3,
            name: 'X',
            type: 'text',
            required: false,
            choices: [],
          },
          {
            id: COL_UUID_1,
            name: 'Y',
            type: 'number',
            required: false,
            choices: [],
          },
          {
            id: COL_UUID_2,
            name: 'Z',
            type: 'text',
            required: false,
            choices: [],
          },
        ],
      });
      seedDef(defA);
      seedDef(defB);

      const { wrapper: wA } = await mountEditor(VALID_UUID_A);
      const fieldsA = wA.find('[data-test="column-fields"]').text().split(',');
      expect(fieldsA).toEqual(['__select', 'Foo', 'Bar']);

      wA.unmount();

      const { wrapper: wB } = await mountEditor(VALID_UUID_B);
      const fieldsB = wB.find('[data-test="column-fields"]').text().split(',');
      expect(fieldsB).toEqual(['__select', 'X', 'Y', 'Z']);
    });
  });

  // ── Save path (feature c2) ──
  // The onSave handler validates every upsert with the runtime Zod schema via
  // safeParse, converts issues into the engine's error shape
  // { row, rowId, field, message } and returns { errors, saved }. ALL-OR-
  // NOTHING: only when there are zero errors does it merge upserts, apply
  // deletes, stamp updatedAt, and write to sc-table-data-{id}.

  describe('save path — validation', () => {
    it('a required text column empty produces a validation error naming that field', async () => {
      seedDef(makeDef());
      await mountEditor(VALID_UUID_A);
      const onSave = saveCapture.onSave!;
      const newRowId = crypto.randomUUID();
      // Add Row only sets { id } — the handler must not surface metadata
      // errors for the missing createdAt/updatedAt; it must surface the
      // user-data error: Title is required.
      const result = await onSave({
        upserts: [{ id: newRowId, Title: '', Score: 42, Status: 'Open' }],
        deletes: [],
      });
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toMatchObject({
        field: 'Title',
        rowId: newRowId,
      });
      expect(result.saved).toBe(0);
    });

    it('a number column with non-numeric text produces a validation error', async () => {
      seedDef(makeDef());
      await mountEditor(VALID_UUID_A);
      const onSave = saveCapture.onSave!;
      const newRowId = crypto.randomUUID();
      const result = await onSave({
        upserts: [{ id: newRowId, Title: 'Hi', Score: 'abc', Status: 'Open' }],
        deletes: [],
      });
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toMatchObject({
        field: 'Score',
        rowId: newRowId,
      });
      expect(result.saved).toBe(0);
    });

    it('a dropdown value outside its defined choices produces a validation error', async () => {
      seedDef(makeDef());
      await mountEditor(VALID_UUID_A);
      const onSave = saveCapture.onSave!;
      const newRowId = crypto.randomUUID();
      const result = await onSave({
        upserts: [{ id: newRowId, Title: 'Hi', Score: 42, Status: 'Critical' }],
        deletes: [],
      });
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toMatchObject({
        field: 'Status',
        rowId: newRowId,
      });
      expect(result.saved).toBe(0);
    });

    it('leaving an optional column empty produces no error', async () => {
      // Score is optional in the default fixture
      seedDef(makeDef());
      await mountEditor(VALID_UUID_A);
      const onSave = saveCapture.onSave!;
      const newRowId = crypto.randomUUID();
      const result = await onSave({
        upserts: [{ id: newRowId, Title: 'Hi', Status: 'Open' }],
        deletes: [],
      });
      expect(result.errors).toEqual([]);
      expect(result.saved).toBe(1);
    });

    it('a new row with only an id and valid data saves cleanly (no metadata errors)', async () => {
      // Add Row sets only { id }. The handler must validate user columns
      // only — not createdAt/updatedAt — and succeed.
      seedDef(makeDef());
      await mountEditor(VALID_UUID_A);
      const onSave = saveCapture.onSave!;
      const newRowId = crypto.randomUUID();
      const result = await onSave({
        upserts: [{ id: newRowId, Title: 'Hi', Score: 10, Status: 'Open' }],
        deletes: [],
      });
      expect(result.errors).toEqual([]);
      expect(result.saved).toBe(1);
      const stored = JSON.parse(
        localStorage.getItem(`sc-table-data-${VALID_UUID_A}`) || '[]',
      );
      expect(stored).toHaveLength(1);
      expect(stored[0].Title).toBe('Hi');
      expect(stored[0].id).toBe(newRowId);
    });

    it('multiple validation errors across multiple rows all appear', async () => {
      seedDef(makeDef());
      await mountEditor(VALID_UUID_A);
      const onSave = saveCapture.onSave!;
      const row1Id = crypto.randomUUID();
      const row2Id = crypto.randomUUID();
      const result = await onSave({
        upserts: [
          { id: row1Id, Title: '', Score: 42, Status: 'Open' },
          { id: row2Id, Title: 'Hi', Score: 99, Status: 'Nope' },
        ],
        deletes: [],
      });
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toMatchObject({ field: 'Title', rowId: row1Id });
      expect(result.errors[1]).toMatchObject({
        field: 'Status',
        rowId: row2Id,
      });
    });
  });

  describe('save path — all-or-nothing persistence', () => {
    it('when any row fails, nothing is written to localStorage', async () => {
      seedDef(makeDef());
      seedRows(VALID_UUID_A, [
        makeRow({ Title: 'Existing', Score: 1, Status: 'Open' }),
      ]);
      await mountEditor(VALID_UUID_A);
      const before = localStorage.getItem(`sc-table-data-${VALID_UUID_A}`);
      const onSave = saveCapture.onSave!;
      await onSave({
        upserts: [
          { id: crypto.randomUUID(), Title: '', Score: 2, Status: 'Open' },
        ],
        deletes: [],
      });
      expect(localStorage.getItem(`sc-table-data-${VALID_UUID_A}`)).toBe(
        before,
      );
    });

    it('a fully valid set of rows saves cleanly and persists', async () => {
      seedDef(makeDef());
      await mountEditor(VALID_UUID_A);
      const onSave = saveCapture.onSave!;
      const rowId = crypto.randomUUID();
      const result = await onSave({
        upserts: [{ id: rowId, Title: 'Hello', Score: 42, Status: 'Open' }],
        deletes: [],
      });
      expect(result.errors).toEqual([]);
      expect(result.saved).toBe(1);
      const stored = JSON.parse(
        localStorage.getItem(`sc-table-data-${VALID_UUID_A}`) || '[]',
      );
      expect(stored).toHaveLength(1);
    });

    it('saving rows does not alter the table definition', async () => {
      seedDef(makeDef({ name: 'My Table' }));
      await mountEditor(VALID_UUID_A);
      const onSave = saveCapture.onSave!;
      await onSave({
        upserts: [
          { id: crypto.randomUUID(), Title: 'Hi', Score: 1, Status: 'Open' },
        ],
        deletes: [],
      });
      const defs = JSON.parse(
        localStorage.getItem('sc-table-defs') || '[]',
      ) as Array<TableDefinition>;
      expect(defs).toHaveLength(1);
      expect(defs[0].name).toBe('My Table');
      expect(defs[0].columns).toEqual(makeDef().columns);
    });
  });

  describe('save path — row metadata', () => {
    it('new rows get a uuid id, createdAt and updatedAt', async () => {
      seedDef(makeDef());
      await mountEditor(VALID_UUID_A);
      const onSave = saveCapture.onSave!;
      const rowId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
      await onSave({
        upserts: [{ id: rowId, Title: 'Hi', Score: 1, Status: 'Open' }],
        deletes: [],
      });
      const stored = JSON.parse(
        localStorage.getItem(`sc-table-data-${VALID_UUID_A}`) || '[]',
      );
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe(rowId);
      expect(stored[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(stored[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('updatedAt changes when an existing row is edited', async () => {
      seedDef(makeDef());
      const existingId = crypto.randomUUID();
      const oldUpdated = '2020-01-01T00:00:00.000Z';
      seedRows(VALID_UUID_A, [
        makeRow({
          id: existingId,
          updatedAt: oldUpdated,
          Title: 'Old',
          Score: 1,
          Status: 'Open',
        }),
      ]);
      await mountEditor(VALID_UUID_A);
      const onSave = saveCapture.onSave!;
      await onSave({
        upserts: [
          {
            id: existingId,
            createdAt: VALID_ISO,
            updatedAt: oldUpdated,
            Title: 'New',
            Score: 1,
            Status: 'Open',
          },
        ],
        deletes: [],
      });
      const stored = JSON.parse(
        localStorage.getItem(`sc-table-data-${VALID_UUID_A}`) || '[]',
      );
      expect(stored).toHaveLength(1);
      expect(stored[0].Title).toBe('New');
      expect(stored[0].updatedAt).not.toBe(oldUpdated);
      expect(stored[0].createdAt).toBe(VALID_ISO);
    });
  });

  describe('save path — deletes', () => {
    it('deletes are applied and removed rows stay gone', async () => {
      seedDef(makeDef());
      const keepId = crypto.randomUUID();
      const deleteId = crypto.randomUUID();
      seedRows(VALID_UUID_A, [
        makeRow({ id: keepId, Title: 'Keep', Score: 1, Status: 'Open' }),
        makeRow({ id: deleteId, Title: 'Delete', Score: 2, Status: 'Open' }),
      ]);
      await mountEditor(VALID_UUID_A);
      const onSave = saveCapture.onSave!;
      const result = await onSave({ upserts: [], deletes: [deleteId] });
      expect(result.errors).toEqual([]);
      expect(result.saved).toBe(1);
      const stored = JSON.parse(
        localStorage.getItem(`sc-table-data-${VALID_UUID_A}`) || '[]',
      );
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe(keepId);
    });
  });

  describe('save path — number coercion', () => {
    it('a numeric string is stored as a number, not a string', async () => {
      seedDef(makeDef());
      await mountEditor(VALID_UUID_A);
      const onSave = saveCapture.onSave!;
      const rowId = crypto.randomUUID();
      await onSave({
        upserts: [{ id: rowId, Title: 'Hi', Score: '42', Status: 'Open' }],
        deletes: [],
      });
      const stored = JSON.parse(
        localStorage.getItem(`sc-table-data-${VALID_UUID_A}`) || '[]',
      );
      expect(stored).toHaveLength(1);
      expect(stored[0].Score).toBe(42);
      expect(typeof stored[0].Score).toBe('number');
    });
  });

  describe('save path — table isolation', () => {
    it('saving rows in one table does not alter the other table rows or definition', async () => {
      const defA = makeDef({
        id: VALID_UUID_A,
        name: 'Table A',
        columns: [
          {
            id: COL_UUID_1,
            name: 'Foo',
            type: 'text',
            required: true,
            choices: [],
          },
        ],
      });
      const defB = makeDef({
        id: VALID_UUID_B,
        name: 'Table B',
        columns: [
          {
            id: COL_UUID_2,
            name: 'X',
            type: 'text',
            required: true,
            choices: [],
          },
        ],
      });
      seedDef(defA);
      seedDef(defB);
      seedRows(VALID_UUID_B, [makeRow({ id: crypto.randomUUID(), X: 'BRow' })]);
      const defBBefore = localStorage.getItem('sc-table-defs');
      const dataBBefore = localStorage.getItem(`sc-table-data-${VALID_UUID_B}`);

      await mountEditor(VALID_UUID_A);
      const onSave = saveCapture.onSave!;
      await onSave({
        upserts: [{ id: crypto.randomUUID(), Foo: 'ARow' }],
        deletes: [],
      });

      expect(localStorage.getItem('sc-table-defs')).toBe(defBBefore);
      expect(localStorage.getItem(`sc-table-data-${VALID_UUID_B}`)).toBe(
        dataBBefore,
      );
      const dataA = JSON.parse(
        localStorage.getItem(`sc-table-data-${VALID_UUID_A}`) || '[]',
      );
      expect(dataA).toHaveLength(1);
      expect(dataA[0].Foo).toBe('ARow');
    });
  });

  // ── Clear + save (feature c3, VAL-CUSTOM-040) ──
  // Saving after a confirmed Clear must write an empty array to the table's
  // stored row data. The save handler receives the deleted row ids via the
  // engine's buildSavePayload (clearGrid marks saved rows as 'deleted' rather
  // than clearing the dirty map), applies the deletes, and writes [].

  describe('clear + save', () => {
    it('saving after clearing writes an empty array to sc-table-data-{id}', async () => {
      seedDef(makeDef());
      const row1Id = crypto.randomUUID();
      const row2Id = crypto.randomUUID();
      seedRows(VALID_UUID_A, [
        makeRow({ id: row1Id, Title: 'First', Score: 1, Status: 'Open' }),
        makeRow({ id: row2Id, Title: 'Second', Score: 2, Status: 'Closed' }),
      ]);
      await mountEditor(VALID_UUID_A);
      const onSave = saveCapture.onSave!;

      // Simulate clearGrid marking all rows as deleted, then save.
      // The engine's clearGrid calls clearData() and marks each existing row
      // as 'deleted' in the dirty map. buildSavePayload then includes all the
      // row ids in deletes with an empty upserts array.
      const result = await onSave({ upserts: [], deletes: [row1Id, row2Id] });

      expect(result.errors).toEqual([]);
      expect(result.saved).toBe(2);
      const stored = JSON.parse(
        localStorage.getItem(`sc-table-data-${VALID_UUID_A}`) || 'null',
      );
      expect(stored).toEqual([]);
    });

    it('clearing a table with no saved rows and saving writes nothing (no deletes)', async () => {
      seedDef(makeDef());
      await mountEditor(VALID_UUID_A);
      const onSave = saveCapture.onSave!;

      // No rows to clear — deletes is empty
      const result = await onSave({ upserts: [], deletes: [] });
      expect(result.errors).toEqual([]);
      expect(result.saved).toBe(0);
    });
  });

  // ── Add Column after creation (feature c4) ──
  // Per architecture.md section 4.4: a toolbar action opens a modal reusing
  // the builder's single-row UI (name / type / required / choices) with the
  // same validation rules, including uniqueness against the existing columns.
  // On confirm the column is appended to the definition, updatedAt is stamped,
  // and existing rows gain the field with value null. Rename, delete and
  // type-change are not offered. Cancelling changes nothing.

  describe('add column — toolbar button and modal', () => {
    it('renders an Add Column button in the toolbar via the toolbarActions render prop', async () => {
      seedDef(makeDef());
      const { wrapper } = await mountEditor(VALID_UUID_A);
      const addColBtn = wrapper.find('[data-label="Add Column"]');
      expect(addColBtn.exists()).toBe(true);
    });

    it('clicking Add Column opens a modal with name, type, required and choices fields', async () => {
      seedDef(makeDef());
      const { wrapper } = await mountEditor(VALID_UUID_A);
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await flushPromises();
      const modal = wrapper.find('[data-test="add-column-modal"]');
      expect(modal.exists()).toBe(true);
      // Name input
      expect(modal.find('.u-input[data-model=""]').exists()).toBe(true);
      // Type select defaults to text
      const select = modal.find('.u-select');
      expect(select.exists()).toBe(true);
      expect(select.attributes('value')).toBe('text');
      // Required checkbox unchecked
      const checkbox = modal.find('.u-checkbox');
      expect(checkbox.exists()).toBe(true);
      expect(checkbox.attributes('checked')).toBeFalsy();
      // Choices input not visible (only for dropdown)
      expect(modal.findAll('.u-input')).toHaveLength(1);
    });

    it('choices input appears only when type is Dropdown', async () => {
      seedDef(makeDef());
      const { wrapper } = await mountEditor(VALID_UUID_A);
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await flushPromises();
      const modal = wrapper.find('[data-test="add-column-modal"]');
      // Initially text — no choices input
      expect(modal.findAll('.u-input')).toHaveLength(1);
      // Change to dropdown
      await modal.find('.u-select').setValue('dropdown');
      await flushPromises();
      const modalAfter = wrapper.find('[data-test="add-column-modal"]');
      expect(modalAfter.findAll('.u-input')).toHaveLength(2); // name + choices
      // Change back to text
      await modalAfter.find('.u-select').setValue('text');
      await flushPromises();
      const modalFinal = wrapper.find('[data-test="add-column-modal"]');
      expect(modalFinal.findAll('.u-input')).toHaveLength(1);
    });

    it('the modal offers no way to rename, delete, or change the type of an existing column', async () => {
      seedDef(makeDef());
      const { wrapper } = await mountEditor(VALID_UUID_A);
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await flushPromises();
      const modal = wrapper.find('[data-test="add-column-modal"]');
      // The modal has exactly one name input, one type select, one required
      // checkbox — for the NEW column only. No list of existing columns, no
      // remove buttons, no per-existing-column type selects.
      expect(modal.findAll('.u-input')).toHaveLength(1);
      expect(modal.findAll('.u-select')).toHaveLength(1);
      expect(modal.findAll('.u-checkbox')).toHaveLength(1);
      expect(modal.findAll('[data-label="Remove"]')).toHaveLength(0);
    });
  });

  describe('add column — validation', () => {
    async function openModal() {
      seedDef(makeDef());
      const { wrapper } = await mountEditor(VALID_UUID_A);
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await flushPromises();
      return wrapper;
    }

    it('rejects an empty name with a validation error and keeps the modal open', async () => {
      const wrapper = await openModal();
      const modal = wrapper.find('[data-test="add-column-modal"]');
      // Leave name empty, click Add Column (confirm)
      await modal.find('[data-label="Add Column"]').trigger('click');
      await flushPromises();
      const errorBox = wrapper.find('[data-testid="add-column-errors"]');
      expect(errorBox.exists()).toBe(true);
      expect(errorBox.text().toLowerCase()).toContain('name');
      // Modal stays open
      expect(wrapper.find('[data-test="add-column-modal"]').exists()).toBe(
        true,
      );
    });

    it('rejects a whitespace-only name', async () => {
      const wrapper = await openModal();
      const modal = wrapper.find('[data-test="add-column-modal"]');
      const nameInput = modal.findAll('.u-input')[0];
      await nameInput.setValue('   ');
      await flushPromises();
      await wrapper
        .find('[data-test="add-column-modal"] [data-label="Add Column"]')
        .trigger('click');
      await flushPromises();
      const errorBox = wrapper.find('[data-testid="add-column-errors"]');
      expect(errorBox.exists()).toBe(true);
    });

    it('rejects a duplicate name case-insensitively', async () => {
      const wrapper = await openModal();
      const modal = wrapper.find('[data-test="add-column-modal"]');
      const nameInput = modal.findAll('.u-input')[0];
      // "title" collides with existing "Title" case-insensitively
      await nameInput.setValue('title');
      await flushPromises();
      await wrapper
        .find('[data-test="add-column-modal"] [data-label="Add Column"]')
        .trigger('click');
      await flushPromises();
      const errorBox = wrapper.find('[data-testid="add-column-errors"]');
      expect(errorBox.exists()).toBe(true);
      expect(errorBox.text().toLowerCase()).toContain('duplicate');
    });

    it('rejects a name with trailing whitespace that collides case-insensitively', async () => {
      const wrapper = await openModal();
      const modal = wrapper.find('[data-test="add-column-modal"]');
      const nameInput = modal.findAll('.u-input')[0];
      // "Status " collides with existing "Status" after trimming
      await nameInput.setValue('Status ');
      await flushPromises();
      await wrapper
        .find('[data-test="add-column-modal"] [data-label="Add Column"]')
        .trigger('click');
      await flushPromises();
      const errorBox = wrapper.find('[data-testid="add-column-errors"]');
      expect(errorBox.exists()).toBe(true);
      expect(errorBox.text().toLowerCase()).toContain('duplicate');
    });

    it('rejects a reserved name case-insensitively', async () => {
      const wrapper = await openModal();
      const modal = wrapper.find('[data-test="add-column-modal"]');
      const nameInput = modal.findAll('.u-input')[0];
      await nameInput.setValue('id');
      await flushPromises();
      await wrapper
        .find('[data-test="add-column-modal"] [data-label="Add Column"]')
        .trigger('click');
      await flushPromises();
      const errorBox = wrapper.find('[data-testid="add-column-errors"]');
      expect(errorBox.exists()).toBe(true);
      expect(errorBox.text().toLowerCase()).toContain('reserved');
    });

    it('rejects a Dropdown with zero parseable choices', async () => {
      const wrapper = await openModal();
      const modal = wrapper.find('[data-test="add-column-modal"]');
      const nameInput = modal.findAll('.u-input')[0];
      await nameInput.setValue('Priority');
      await modal.find('.u-select').setValue('dropdown');
      await flushPromises();
      // Leave choices empty
      await wrapper
        .find('[data-test="add-column-modal"] [data-label="Add Column"]')
        .trigger('click');
      await flushPromises();
      const errorBox = wrapper.find('[data-testid="add-column-errors"]');
      expect(errorBox.exists()).toBe(true);
      expect(errorBox.text().toLowerCase()).toContain('choice');
    });

    it('rejects a Dropdown with only commas and spaces as choices', async () => {
      const wrapper = await openModal();
      const modal = wrapper.find('[data-test="add-column-modal"]');
      const nameInput = modal.findAll('.u-input')[0];
      await nameInput.setValue('Priority');
      await modal.find('.u-select').setValue('dropdown');
      await flushPromises();
      const modalAfter = wrapper.find('[data-test="add-column-modal"]');
      const choicesInput = modalAfter.findAll('.u-input')[1];
      await choicesInput.setValue(', , ,');
      await flushPromises();
      await wrapper
        .find('[data-test="add-column-modal"] [data-label="Add Column"]')
        .trigger('click');
      await flushPromises();
      const errorBox = wrapper.find('[data-testid="add-column-errors"]');
      expect(errorBox.exists()).toBe(true);
    });
  });

  describe('add column — confirm appends and stamps updatedAt', () => {
    it('appends the new column as the last column in the grid', async () => {
      seedDef(makeDef());
      const { wrapper } = await mountEditor(VALID_UUID_A);
      // Initial columns: __select, Title, Score, Status
      let fields = wrapper
        .find('[data-test="column-fields"]')
        .text()
        .split(',');
      expect(fields).toEqual(['__select', 'Title', 'Score', 'Status']);

      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await flushPromises();
      const modal = wrapper.find('[data-test="add-column-modal"]');
      const nameInput = modal.findAll('.u-input')[0];
      await nameInput.setValue('Notes');
      await flushPromises();
      // Click the confirm button (labelled "Add Column" inside the modal)
      await modal.find('[data-label="Add Column"]').trigger('click');
      await flushPromises();

      // The grid remounts with the new column appended
      fields = wrapper.find('[data-test="column-fields"]').text().split(',');
      expect(fields).toEqual(['__select', 'Title', 'Score', 'Status', 'Notes']);
    });

    it('stamps the definition updatedAt', async () => {
      seedDef(makeDef({ updatedAt: '2020-01-01T00:00:00.000Z' }));
      const { wrapper } = await mountEditor(VALID_UUID_A);
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await flushPromises();
      const modal = wrapper.find('[data-test="add-column-modal"]');
      const nameInput = modal.findAll('.u-input')[0];
      await nameInput.setValue('Notes');
      await flushPromises();
      await modal.find('[data-label="Add Column"]').trigger('click');
      await flushPromises();

      const defs = JSON.parse(
        localStorage.getItem('sc-table-defs') || '[]',
      ) as Array<TableDefinition>;
      expect(defs).toHaveLength(1);
      expect(defs[0].updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
      expect(defs[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('the new column is persisted in the definition with correct type, required and choices', async () => {
      seedDef(makeDef());
      const { wrapper } = await mountEditor(VALID_UUID_A);
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await flushPromises();
      const modal = wrapper.find('[data-test="add-column-modal"]');
      const nameInput = modal.findAll('.u-input')[0];
      await nameInput.setValue('Category');
      await modal.find('.u-select').setValue('dropdown');
      await flushPromises();
      const modalAfter = wrapper.find('[data-test="add-column-modal"]');
      const choicesInput = modalAfter.findAll('.u-input')[1];
      await choicesInput.setValue('A, B, C');
      const checkbox = modalAfter.find('.u-checkbox');
      await checkbox.setValue(true);
      await flushPromises();
      await modalAfter.find('[data-label="Add Column"]').trigger('click');
      await flushPromises();

      const defs = JSON.parse(
        localStorage.getItem('sc-table-defs') || '[]',
      ) as Array<TableDefinition>;
      const cols = defs[0].columns;
      expect(cols).toHaveLength(4);
      const newCol = cols[3];
      expect(newCol.name).toBe('Category');
      expect(newCol.type).toBe('dropdown');
      expect(newCol.required).toBe(true);
      expect(newCol.choices).toEqual(['A', 'B', 'C']);
      expect(newCol.id).toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
      );
    });
  });

  describe('add column — existing rows get null, data not lost', () => {
    it('existing rows gain the new field with value null and retain all pre-existing values', async () => {
      seedDef(makeDef());
      const row1Id = crypto.randomUUID();
      const row2Id = crypto.randomUUID();
      seedRows(VALID_UUID_A, [
        makeRow({ id: row1Id, Title: 'First', Score: 1, Status: 'Open' }),
        makeRow({ id: row2Id, Title: 'Second', Score: 2, Status: 'Closed' }),
      ]);
      const { wrapper } = await mountEditor(VALID_UUID_A);
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await flushPromises();
      const modal = wrapper.find('[data-test="add-column-modal"]');
      const nameInput = modal.findAll('.u-input')[0];
      await nameInput.setValue('Notes');
      await flushPromises();
      await modal.find('[data-label="Add Column"]').trigger('click');
      await flushPromises();

      const stored = JSON.parse(
        localStorage.getItem(`sc-table-data-${VALID_UUID_A}`) || '[]',
      );
      expect(stored).toHaveLength(2);
      // Pre-existing values retained
      expect(stored[0].Title).toBe('First');
      expect(stored[0].Score).toBe(1);
      expect(stored[0].Status).toBe('Open');
      expect(stored[1].Title).toBe('Second');
      expect(stored[1].Score).toBe(2);
      expect(stored[1].Status).toBe('Closed');
      // New field is null on both rows
      expect(stored[0].Notes).toBeNull();
      expect(stored[1].Notes).toBeNull();
    });
  });

  describe('add column — required column on a table with rows', () => {
    it('adding a required column is allowed; saving then fails naming the new column on each existing row', async () => {
      seedDef(makeDef());
      const row1Id = crypto.randomUUID();
      const row2Id = crypto.randomUUID();
      seedRows(VALID_UUID_A, [
        makeRow({ id: row1Id, Title: 'First', Score: 1, Status: 'Open' }),
        makeRow({ id: row2Id, Title: 'Second', Score: 2, Status: 'Closed' }),
      ]);
      const { wrapper } = await mountEditor(VALID_UUID_A);
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await flushPromises();
      const modal = wrapper.find('[data-test="add-column-modal"]');
      const nameInput = modal.findAll('.u-input')[0];
      await nameInput.setValue('Mandatory');
      const checkbox = modal.find('.u-checkbox');
      await checkbox.setValue(true);
      await flushPromises();
      await modal.find('[data-label="Add Column"]').trigger('click');
      await flushPromises();

      // Now save — both rows should fail validation for the new required
      // column "Mandatory" because it is null on both.
      const onSave = saveCapture.onSave!;
      const result = await onSave({
        upserts: [
          {
            id: row1Id,
            Title: 'First',
            Score: 1,
            Status: 'Open',
            Mandatory: null,
          },
          {
            id: row2Id,
            Title: 'Second',
            Score: 2,
            Status: 'Closed',
            Mandatory: null,
          },
        ],
        deletes: [],
      });
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      const fields = result.errors.map((e: { field: string }) => e.field);
      expect(fields.filter((f: string) => f === 'Mandatory')).toHaveLength(2);
    });

    it('filling the new required column for every row makes the save succeed', async () => {
      seedDef(makeDef());
      const row1Id = crypto.randomUUID();
      const row2Id = crypto.randomUUID();
      seedRows(VALID_UUID_A, [
        makeRow({ id: row1Id, Title: 'First', Score: 1, Status: 'Open' }),
        makeRow({ id: row2Id, Title: 'Second', Score: 2, Status: 'Closed' }),
      ]);
      const { wrapper } = await mountEditor(VALID_UUID_A);
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await flushPromises();
      const modal = wrapper.find('[data-test="add-column-modal"]');
      const nameInput = modal.findAll('.u-input')[0];
      await nameInput.setValue('Mandatory');
      const checkbox = modal.find('.u-checkbox');
      await checkbox.setValue(true);
      await flushPromises();
      await modal.find('[data-label="Add Column"]').trigger('click');
      await flushPromises();

      const onSave = saveCapture.onSave!;
      const result = await onSave({
        upserts: [
          {
            id: row1Id,
            Title: 'First',
            Score: 1,
            Status: 'Open',
            Mandatory: 'yes',
          },
          {
            id: row2Id,
            Title: 'Second',
            Score: 2,
            Status: 'Closed',
            Mandatory: 'yes',
          },
        ],
        deletes: [],
      });
      expect(result.errors).toEqual([]);
      expect(result.saved).toBe(2);
    });
  });

  describe('add column — cancel changes nothing', () => {
    it('cancelling the modal changes neither the grid columns nor the definition nor storage', async () => {
      seedDef(makeDef({ updatedAt: '2020-01-01T00:00:00.000Z' }));
      const defBefore = localStorage.getItem('sc-table-defs');
      const { wrapper } = await mountEditor(VALID_UUID_A);
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await flushPromises();
      const modal = wrapper.find('[data-test="add-column-modal"]');
      const nameInput = modal.findAll('.u-input')[0];
      await nameInput.setValue('Notes');
      await flushPromises();
      // Click Cancel
      await modal.find('[data-label="Cancel"]').trigger('click');
      await flushPromises();
      // Modal closed
      expect(wrapper.find('[data-test="add-column-modal"]').exists()).toBe(
        false,
      );
      // Columns unchanged
      const fields = wrapper
        .find('[data-test="column-fields"]')
        .text()
        .split(',');
      expect(fields).toEqual(['__select', 'Title', 'Score', 'Status']);
      // Definition unchanged
      expect(localStorage.getItem('sc-table-defs')).toBe(defBefore);
    });
  });
});
