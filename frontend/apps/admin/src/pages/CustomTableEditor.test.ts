import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h, type VNode } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { TableDefinition, TableRow } from 'src/types/customTable';

import CustomTableEditor from './CustomTableEditor';

// ── Stub GridEditor ──
// The real GridEditor imports Tabulator, which must never be loaded in a unit
// test. The stub surfaces the props the page passes (title, columns, data,
// exportFilename) as data attributes so the tests can assert on them without
// driving the real grid engine.
vi.mock('components/GridEditor', () => ({
  default: defineComponent({
    name: 'GridEditor',
    props: {
      columns: { type: Array as () => Record<string, unknown>[], required: true },
      data: { type: Array as () => Record<string, unknown>[], required: true },
      onSave: { type: Function, required: true },
      title: { type: String, required: true },
      exportFilename: { type: String, required: true },
      toolbarActions: { type: Function, default: undefined },
    },
    setup(props) {
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
              (props.columns as Record<string, unknown>[])
                .map((c) => String(c.field))
                .join(','),
            ),
          ],
        );
    },
  }),
}));

// ── Stub UButton (used in the not-found state) ──
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
      { id: COL_UUID_1, name: 'Title', type: 'text', required: true, choices: [] },
      { id: COL_UUID_2, name: 'Score', type: 'number', required: false, choices: [] },
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
  const list: TableDefinition[] = existing ? JSON.parse(existing) : [];
  list.push(d);
  localStorage.setItem('sc-table-defs', JSON.stringify(list));
}

function seedRows(tableId: string, rows: TableRow[]) {
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
        wrapper.find('[data-test="grid-editor"]').attributes('data-export-filename'),
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
      localStorage.setItem(`sc-table-data-${VALID_UUID_A}`, '{"not":"an array"}');
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
          { id: VALID_UUID_A, createdAt: VALID_ISO, updatedAt: VALID_ISO, Title: 'valid' },
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
          { id: COL_UUID_1, name: 'Foo', type: 'text', required: false, choices: [] },
          { id: COL_UUID_2, name: 'Bar', type: 'text', required: false, choices: [] },
        ],
      });
      const defB = makeDef({
        id: VALID_UUID_B,
        name: 'Table B',
        columns: [
          { id: COL_UUID_3, name: 'X', type: 'text', required: false, choices: [] },
          { id: COL_UUID_1, name: 'Y', type: 'number', required: false, choices: [] },
          { id: COL_UUID_2, name: 'Z', type: 'text', required: false, choices: [] },
        ],
      });
      seedDef(defA);
      seedDef(defB);

      const { wrapper: wA } = await mountEditor(VALID_UUID_A);
      const fieldsA = wA
        .find('[data-test="column-fields"]')
        .text()
        .split(',');
      expect(fieldsA).toEqual(['__select', 'Foo', 'Bar']);

      wA.unmount();

      const { wrapper: wB } = await mountEditor(VALID_UUID_B);
      const fieldsB = wB
        .find('[data-test="column-fields"]')
        .text()
        .split(',');
      expect(fieldsB).toEqual(['__select', 'X', 'Y', 'Z']);
    });
  });
});
