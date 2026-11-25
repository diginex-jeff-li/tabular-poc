import { mount, flushPromises } from '@vue/test-utils';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vite-plus/test';
import { nextTick, defineComponent, h, type VNode } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import CustomTableList from './CustomTableList';
import type { TableDefinition } from 'src/types/customTable';

// ── Stub Nuxt UI components ──
// The real UButton internally renders a Nuxt UI Link that injects a vue-router
// route location; mocking the three paths CustomTableList imports directly keeps
// the unit test isolated and avoids loading the full Nuxt UI runtime.

vi.mock('@nuxt/ui/components/Button.vue', () => ({
  default: defineComponent({
    name: 'UButton',
    props: {
      label: { type: String, default: '' },
      color: { type: String, default: '' },
      variant: { type: String, default: '' },
      size: { type: String, default: '' },
      loading: { type: Boolean, default: false },
      disabled: { type: Boolean, default: false },
    },
    emits: ['click'],
    setup(props, { emit }) {
      return (): VNode =>
        h(
          'button',
          {
            class: ['u-button', `u-button--${props.color}`],
            disabled: props.disabled ? true : undefined,
            'data-label': props.label,
            onClick: (e: Event) => emit('click', e),
          },
          props.label,
        );
    },
  }),
}));

vi.mock('@nuxt/ui/components/Modal.vue', () => ({
  default: defineComponent({
    name: 'UModal',
    props: {
      open: { type: Boolean, default: false },
    },
    emits: ['update:open'],
    setup(props, { slots, emit }) {
      return (): VNode =>
        props.open
          ? h(
              'div',
              {
                class: 'u-modal',
                'data-open': 'true',
              },
              [
                slots.default?.(),
                h(
                  'button',
                  {
                    class: 'u-button',
                    'data-label': 'modal-close',
                    onClick: () => emit('update:open', false),
                  },
                  'Close',
                ),
              ],
            )
          : h('div', { class: 'u-modal', 'data-open': 'false' });
    },
  }),
}));

vi.mock('@nuxt/ui/components/Card.vue', () => ({
  default: defineComponent({
    name: 'UCard',
    setup(_, { slots }) {
      return (): VNode =>
        h('div', { class: 'u-card' }, [
          h('div', { class: 'u-card__body' }, slots.default?.()),
        ]);
    },
  }),
}));

// ── Test fixtures ──

const VALID_UUID_A = '11111111-1111-4111-8111-111111111111';
const VALID_UUID_B = '22222222-2222-4222-8222-222222222222';
const VALID_UUID_C = '33333333-3333-4333-8333-333333333333';
const COL_UUID_1 = '44444444-4444-4444-8444-444444444444';
const COL_UUID_2 = '55555555-5555-4555-8555-555555555555';
const COL_UUID_3 = '66666666-6666-4666-8666-666666666666';
const COL_UUID_4 = '77777777-7777-4777-8777-777777777777';
const COL_UUID_5 = '88888888-8888-4888-8888-888888888888';
const COL_UUID_6 = '99999999-9999-4999-8999-999999999999';
const VALID_ISO = '2026-08-11T12:00:00.000Z';

function col(
  id: string,
  name: string,
  over: Partial<TableDefinition['columns'][number]> = {},
) {
  return {
    id,
    name,
    type: 'text' as const,
    required: false,
    choices: [] as Array<string>,
    ...over,
  };
}

function def(over: Partial<TableDefinition> = {}): TableDefinition {
  return {
    id: VALID_UUID_A,
    name: 'Test Table',
    columns: [
      col(COL_UUID_1, 'Title'),
      col(COL_UUID_2, 'Score', { type: 'number' }),
      col(COL_UUID_3, 'Status', {
        type: 'dropdown',
        choices: ['Open', 'Closed'],
      }),
    ],
    createdAt: VALID_ISO,
    updatedAt: VALID_ISO,
    ...over,
  };
}

// ── Router helper ──
// createMemoryHistory avoids touching the real browser history; the router
// resolves `/custom` synchronously so the list page mounts on the first tick.

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/custom',
        component: CustomTableList,
      },
      {
        path: '/',
        component: defineComponent({
          name: 'HomeStub',
          setup: () => (): VNode => h('div', { 'data-test': 'home' }),
        }),
      },
      {
        path: '/custom/new',
        component: defineComponent({
          name: 'NewStub',
          setup: () => (): VNode => h('div', { 'data-test': 'new-table' }),
        }),
      },
      {
        path: '/custom/:tableId',
        component: defineComponent({
          name: 'EditorStub',
          setup: () => (): VNode => h('div', { 'data-test': 'editor' }),
        }),
      },
    ],
  });
}

async function mountList() {
  const router = makeRouter();
  await router.push('/custom');
  await router.isReady();
  const wrapper = mount(CustomTableList, {
    global: {
      plugins: [router],
    },
  });
  await flushPromises();
  await nextTick();
  return { wrapper, router };
}

function seedDef(d: TableDefinition) {
  const existing = localStorage.getItem('sc-table-defs');
  const list = existing ? JSON.parse(existing) : [];
  list.push(d);
  localStorage.setItem('sc-table-defs', JSON.stringify(list));
}

function seedRows(tableId: string, rows: Array<Record<string, unknown>>) {
  localStorage.setItem(`sc-table-data-${tableId}`, JSON.stringify(rows));
}

// spy on console.warn so corruption tests don't pollute output
let warnSpy: ReturnType<typeof vi.spyOn>;

describe('CustomTableList', () => {
  beforeEach(() => {
    localStorage.clear();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('empty state', () => {
    it('renders an explanatory empty state when no tables are stored', async () => {
      const { wrapper } = await mountList();
      expect(wrapper.text()).toContain('Custom Tables');
      // explanatory text
      expect(wrapper.text().toLowerCase()).toContain('no custom tables');
      // New Table button present
      expect(wrapper.find('[data-label="New Table"]').exists()).toBe(true);
    });

    it('renders no cards when there are no definitions', async () => {
      const { wrapper } = await mountList();
      expect(wrapper.findAll('.u-card')).toHaveLength(0);
    });

    it('the empty state New Table button navigates to /custom/new', async () => {
      const { wrapper, router } = await mountList();
      const newButton = wrapper.find('[data-label="New Table"]');
      expect(newButton.exists()).toBe(true);
      await newButton.trigger('click');
      await flushPromises();
      await nextTick();
      expect(router.currentRoute.value.path).toBe('/custom/new');
    });
  });

  describe('populated list — cards', () => {
    it('renders one card per definition showing the table name', async () => {
      seedDef(def({ id: VALID_UUID_A, name: 'Alpha' }));
      seedDef(def({ id: VALID_UUID_B, name: 'Beta' }));
      const { wrapper } = await mountList();
      const cards = wrapper.findAll('.u-card');
      expect(cards).toHaveLength(2);
      expect(wrapper.text()).toContain('Alpha');
      expect(wrapper.text()).toContain('Beta');
    });

    it('shows the column count matching the definition exactly (no phantom columns)', async () => {
      seedDef(
        def({
          id: VALID_UUID_A,
          columns: [
            col(COL_UUID_1, 'A'),
            col(COL_UUID_2, 'B'),
            col(COL_UUID_3, 'C'),
            col(COL_UUID_4, 'D'),
          ],
        }),
      );
      const { wrapper } = await mountList();
      expect(wrapper.text()).toContain('4');
      expect(wrapper.text()).not.toContain('5 columns');
    });

    it('reads the row count from the table data key, not the definition', async () => {
      seedDef(def({ id: VALID_UUID_A }));
      seedRows(VALID_UUID_A, [
        {
          id: VALID_UUID_A,
          createdAt: VALID_ISO,
          updatedAt: VALID_ISO,
          Title: 'x',
        },
        {
          id: VALID_UUID_B,
          createdAt: VALID_ISO,
          updatedAt: VALID_ISO,
          Title: 'y',
        },
        {
          id: VALID_UUID_C,
          createdAt: VALID_ISO,
          updatedAt: VALID_ISO,
          Title: 'z',
        },
      ]);
      const { wrapper } = await mountList();
      const card = wrapper.find('.u-card');
      expect(card.text()).toContain('3');
    });

    it('shows a row count of zero for a table with no saved rows', async () => {
      seedDef(def({ id: VALID_UUID_A }));
      // no data key
      const { wrapper } = await mountList();
      const card = wrapper.find('.u-card');
      expect(card.text()).toContain('0');
    });

    it('displays a human-readable last-modified value derived from updatedAt', async () => {
      seedDef(def({ id: VALID_UUID_A, updatedAt: '2026-08-11T12:00:00.000Z' }));
      const { wrapper } = await mountList();
      const card = wrapper.find('.u-card');
      // Should contain a date-like string — accept either the ISO string or a
      // locale rendering. The exact format is not contractually fixed.
      const text = card.text();
      expect(text.length).toBeGreaterThan(0);
      // The updatedAt year should appear somewhere in the card
      expect(text).toMatch(/2026/);
    });

    it('renders multiple cards with correct names and column counts', async () => {
      seedDef(
        def({
          id: VALID_UUID_A,
          name: 'Alpha',
          columns: [col(COL_UUID_1, 'A')],
        }),
      );
      seedDef(
        def({
          id: VALID_UUID_B,
          name: 'Beta',
          columns: [col(COL_UUID_2, 'B'), col(COL_UUID_3, 'C')],
        }),
      );
      seedDef(
        def({
          id: VALID_UUID_C,
          name: 'Gamma',
          columns: [
            col(COL_UUID_4, 'D'),
            col(COL_UUID_5, 'E'),
            col(COL_UUID_6, 'F'),
          ],
        }),
      );
      const { wrapper } = await mountList();
      const cards = wrapper.findAll('.u-card');
      expect(cards).toHaveLength(3);
      // each name present
      expect(wrapper.text()).toContain('Alpha');
      expect(wrapper.text()).toContain('Beta');
      expect(wrapper.text()).toContain('Gamma');
      // column counts: Alpha 1, Beta 2, Gamma 3 — at least the distinct counts appear
      const aCard = cards.find((c) => c.text().includes('Alpha'));
      expect(aCard).toBeDefined();
      expect(aCard!.text()).toContain('1');
      const gCard = cards.find((c) => c.text().includes('Gamma'));
      expect(gCard).toBeDefined();
      expect(gCard!.text()).toContain('3');
    });
  });

  describe('New Table button on populated list', () => {
    it('the header New Table button navigates to /custom/new', async () => {
      seedDef(def({ id: VALID_UUID_A }));
      const { wrapper, router } = await mountList();
      const buttons = wrapper.findAll('[data-label]');
      const newBtn = buttons.find(
        (b) => b.attributes('data-label') === 'New Table',
      );
      expect(newBtn).toBeDefined();
      await newBtn!.trigger('click');
      await flushPromises();
      await nextTick();
      expect(router.currentRoute.value.path).toBe('/custom/new');
    });
  });

  describe('card click navigation', () => {
    it('clicking a card navigates to /custom/:tableId', async () => {
      seedDef(def({ id: VALID_UUID_A, name: 'Click Me' }));
      const { wrapper, router } = await mountList();
      // click the inner role="link" element that carries the onClick handler
      const cardLink = wrapper.find('[role="link"]');
      expect(cardLink.exists()).toBe(true);
      await cardLink.trigger('click');
      await flushPromises();
      await nextTick();
      expect(router.currentRoute.value.path).toBe(`/custom/${VALID_UUID_A}`);
    });
  });

  describe('delete confirmation modal', () => {
    it('the delete button opens a modal naming the table', async () => {
      seedDef(def({ id: VALID_UUID_A, name: 'Delete Me' }));
      const { wrapper } = await mountList();
      const deleteBtn = wrapper.find('[data-label="Delete"]');
      expect(deleteBtn.exists()).toBe(true);
      await deleteBtn.trigger('click');
      await nextTick();
      const modal = wrapper.find('.u-modal[data-open="true"]');
      expect(modal.exists()).toBe(true);
      // The modal must name the table
      expect(wrapper.text()).toContain('Delete Me');
    });

    it('cancelling the modal leaves the definition and data intact', async () => {
      seedDef(def({ id: VALID_UUID_A, name: 'Keep Me' }));
      seedRows(VALID_UUID_A, [
        {
          id: VALID_UUID_A,
          createdAt: VALID_ISO,
          updatedAt: VALID_ISO,
          Title: 'x',
        },
      ]);
      const { wrapper } = await mountList();
      // open delete modal
      const deleteBtn = wrapper.find('[data-label="Delete"]');
      await deleteBtn.trigger('click');
      await nextTick();
      // cancel — click the Cancel button
      const cancelBtn = wrapper
        .findAll('button')
        .find((b) => b.text() === 'Cancel');
      expect(cancelBtn).toBeDefined();
      await cancelBtn!.trigger('click');
      await nextTick();
      // modal closed
      const modal = wrapper.find('.u-modal[data-open="true"]');
      expect(modal.exists()).toBe(false);
      // definition still in storage
      const raw = localStorage.getItem('sc-table-defs');
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string)).toHaveLength(1);
      // data key still present
      expect(
        localStorage.getItem(`sc-table-data-${VALID_UUID_A}`),
      ).not.toBeNull();
    });

    it('confirming delete removes the definition and its data key', async () => {
      seedDef(def({ id: VALID_UUID_A, name: 'Remove Me' }));
      seedRows(VALID_UUID_A, [
        {
          id: VALID_UUID_A,
          createdAt: VALID_ISO,
          updatedAt: VALID_ISO,
          Title: 'x',
        },
      ]);
      const { wrapper } = await mountList();
      const deleteBtn = wrapper.find('[data-label="Delete"]');
      await deleteBtn.trigger('click');
      await nextTick();
      const confirmBtn = wrapper
        .findAll('button')
        .find((b) => b.text() === 'Confirm');
      expect(confirmBtn).toBeDefined();
      await confirmBtn!.trigger('click');
      await flushPromises();
      await nextTick();
      // card removed from DOM
      expect(wrapper.findAll('.u-card')).toHaveLength(0);
      // definition gone from storage
      const raw = localStorage.getItem('sc-table-defs');
      expect(JSON.parse(raw as string)).toHaveLength(0);
      // data key gone
      expect(localStorage.getItem(`sc-table-data-${VALID_UUID_A}`)).toBeNull();
    });

    it('confirming delete leaves sibling tables untouched', async () => {
      seedDef(def({ id: VALID_UUID_A, name: 'Remove Me' }));
      seedDef(def({ id: VALID_UUID_B, name: 'Survivor' }));
      seedRows(VALID_UUID_A, [
        {
          id: VALID_UUID_A,
          createdAt: VALID_ISO,
          updatedAt: VALID_ISO,
          Title: 'x',
        },
      ]);
      seedRows(VALID_UUID_B, [
        {
          id: VALID_UUID_B,
          createdAt: VALID_ISO,
          updatedAt: VALID_ISO,
          Title: 'y',
        },
      ]);
      const { wrapper } = await mountList();
      expect(wrapper.findAll('.u-card')).toHaveLength(2);
      // find the delete button belonging to the first card (Remove Me)
      const deleteBtn = wrapper.find('[data-label="Delete"]');
      await deleteBtn.trigger('click');
      await nextTick();
      const confirmBtn = wrapper
        .findAll('button')
        .find((b) => b.text() === 'Confirm');
      await confirmBtn!.trigger('click');
      await flushPromises();
      await nextTick();
      // one card remains — the Survivor
      const cards = wrapper.findAll('.u-card');
      expect(cards).toHaveLength(1);
      expect(wrapper.text()).toContain('Survivor');
      // storage: only survivor remains
      const raw = localStorage.getItem('sc-table-defs');
      const parsed = JSON.parse(raw as string);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe(VALID_UUID_B);
      // survivor data intact
      expect(
        localStorage.getItem(`sc-table-data-${VALID_UUID_B}`),
      ).not.toBeNull();
      // removed data key gone
      expect(localStorage.getItem(`sc-table-data-${VALID_UUID_A}`)).toBeNull();
    });
  });

  describe('corruption tolerance', () => {
    it('renders the empty state for malformed JSON in sc-table-defs', async () => {
      localStorage.setItem('sc-table-defs', '{broken');
      const { wrapper } = await mountList();
      expect(wrapper.findAll('.u-card')).toHaveLength(0);
      expect(wrapper.text().toLowerCase()).toContain('no custom tables');
      expect(wrapper.find('[data-label="New Table"]').exists()).toBe(true);
    });

    it('renders the empty state for a non-array payload', async () => {
      localStorage.setItem('sc-table-defs', '{"not": "an array"}');
      const { wrapper } = await mountList();
      expect(wrapper.findAll('.u-card')).toHaveLength(0);
      expect(wrapper.text().toLowerCase()).toContain('no custom tables');
    });

    it('renders only valid entries and drops schema-invalid ones', async () => {
      const valid = def({ id: VALID_UUID_A, name: 'Valid One' });
      const invalid = { foo: 'bar', not: 'a table' };
      localStorage.setItem('sc-table-defs', JSON.stringify([valid, invalid]));
      const { wrapper } = await mountList();
      const cards = wrapper.findAll('.u-card');
      expect(cards).toHaveLength(1);
      expect(wrapper.text()).toContain('Valid One');
    });
  });

  describe('stable card order', () => {
    it('renders cards in storage order (insertion order)', async () => {
      seedDef(def({ id: VALID_UUID_C, name: 'Gamma' }));
      seedDef(def({ id: VALID_UUID_A, name: 'Alpha' }));
      seedDef(def({ id: VALID_UUID_B, name: 'Beta' }));
      const { wrapper } = await mountList();
      const cards = wrapper.findAll('.u-card');
      expect(cards).toHaveLength(3);
      // Order must match the storage array order: Gamma, Alpha, Beta
      expect(cards[0].text()).toContain('Gamma');
      expect(cards[1].text()).toContain('Alpha');
      expect(cards[2].text()).toContain('Beta');
    });

    it('order is stable — re-mounting yields the same sequence', async () => {
      seedDef(def({ id: VALID_UUID_C, name: 'Gamma' }));
      seedDef(def({ id: VALID_UUID_A, name: 'Alpha' }));
      seedDef(def({ id: VALID_UUID_B, name: 'Beta' }));
      const { wrapper: w1 } = await mountList();
      const names1 = w1
        .findAll('.u-card')
        .map((c) => c.text().match(/(Gamma|Alpha|Beta)/)?.[0]);
      w1.unmount();
      const { wrapper: w2 } = await mountList();
      const names2 = w2
        .findAll('.u-card')
        .map((c) => c.text().match(/(Gamma|Alpha|Beta)/)?.[0]);
      expect(names2).toEqual(names1);
    });
  });
});
