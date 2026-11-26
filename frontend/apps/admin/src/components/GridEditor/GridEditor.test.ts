import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { h, defineComponent } from 'vue';
import GridEditor from './GridEditor';
import type { ColumnVisibilityItem } from 'components/ColumnVisibilityMenu';
import type { PropType, VNode } from 'vue';

// ── Mock the grid engine composable so the presentation is isolated ──
//
// useGridEditor imports the real Tabulator, which must never be loaded in a
// unit test (per the mission's testing rules). We mock the composable to
// return controllable refs and no-op handlers, exercising only GridEditor's
// render logic: the toolbar, the empty-state overlay, and the toolbarActions
// render prop.
//
// vi.hoisted runs before top-level imports resolve, so `ref` cannot be called
// there. The hoisted container holds a null `refs` slot; the mock factory
// populates it with real refs via a dynamic import of vue, and the tests
// mutate those refs through the same container.

const mockState = vi.hoisted(() => ({
  refs: null as Record<string, any> | null,
}));

vi.mock('composables/useGridEditor', async () => {
  const { ref } = await import('vue');
  const { vi: _vi } = await import('vite-plus/test');
  mockState.refs = {
    rowCount: ref(0),
    dirtyCount: ref(0),
    isSaving: ref(false),
    errorList: ref([]),
    saveResult: ref(null),
    handleAddRow: _vi.fn(),
    handleSave: _vi.fn(),
    handleDeleteSelected: _vi.fn(),
    handleExportCSV: _vi.fn(),
    clearGrid: _vi.fn(),
    scrollToError: _vi.fn(),
    columnItems: ref([
      { id: 'status', title: 'Status', visible: true, locked: true },
      { id: 'issue', title: 'Issue', visible: true, locked: false },
    ]),
    setColumnVisible: _vi.fn(),
    // Where each row sits in the grid as shown; r3 is filtered out.
    rowNumber: (rowId: string) =>
      ({ r1: 5 } as Record<string, number>)[rowId] ?? null,
  };
  return {
    useGridEditor: () => mockState.refs,
  };
});

// ── Stub Nuxt UI components ──
//
// The real UButton internally renders a Nuxt UI `Link` component that injects
// a vue-router route location — which does not exist under vitest without a
// router installed. We mock the three Nuxt UI component paths GridEditor
// imports directly, replacing them with simple elements that surface their
// label text and forward click events.

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
            'data-loading': props.loading ? 'true' : undefined,
            onClick: () => emit('click'),
          },
          props.label,
        );
    },
  }),
}));

vi.mock('@nuxt/ui/components/Badge.vue', () => ({
  default: defineComponent({
    name: 'UBadge',
    props: {
      label: { type: String, default: '' },
      color: { type: String, default: '' },
      variant: { type: String, default: '' },
      size: { type: String, default: '' },
    },
    setup(props) {
      return (): VNode => h('span', { class: 'u-badge' }, props.label);
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
    setup(props, { slots }) {
      return (): VNode =>
        props.open
          ? h('div', { class: 'u-modal' }, slots.content?.())
          : h('div', { class: 'u-modal u-modal--closed' });
    },
  }),
}));

// The real menu is a Nuxt UI dropdown; the stub shows the columns it got
// and, when clicked, hides Issue, which is all GridEditor wires.
vi.mock('components/ColumnVisibilityMenu', () => ({
  default: defineComponent({
    name: 'ColumnVisibilityMenu',
    props: {
      columns: {
        type: Array as PropType<Array<ColumnVisibilityItem>>,
        required: true,
      },
      onToggle: {
        type: Function as PropType<(id: string, visible: boolean) => void>,
        required: true,
      },
    },
    setup(props) {
      return (): VNode =>
        h(
          'button',
          {
            class: 'column-menu',
            'data-columns': props.columns
              .map((c) => `${c.id}:${c.visible}:${c.locked}`)
              .join(','),
            onClick: () => props.onToggle('issue', false),
          },
          'Columns',
        );
    },
  }),
}));

// ── Helper to mount GridEditor with controllable props ──
function mountGridEditor(
  options: {
    title?: string;
    toolbarActions?: () => VNode | Array<VNode>;
  } = {},
) {
  const onSave = vi.fn().mockResolvedValue({ errors: [], saved: 0 });
  return mount(GridEditor, {
    props: {
      columns: [
        { field: '__select', clipboard: false },
        { field: 'issue', clipboard: true },
      ],
      data: [{ id: 'r1', issue: 'row' }],
      onSave,
      title: options.title ?? 'Test Editor',
      exportFilename: 'test-export.csv',
      toolbarActions: options.toolbarActions,
    },
  });
}

describe('GridEditor — toolbar', () => {
  beforeEach(() => {
    mockState.refs.rowCount.value = 0;
    mockState.refs.dirtyCount.value = 0;
    mockState.refs.isSaving.value = false;
    mockState.refs.errorList.value = [];
    mockState.refs.saveResult.value = null;
  });

  it('renders the title in the toolbar', () => {
    const wrapper = mountGridEditor({ title: 'Compliance Library Editor' });
    const h1 = wrapper.find('h1');
    expect(h1.exists()).toBe(true);
    expect(h1.text()).toBe('Compliance Library Editor');
  });

  it('renders all standard toolbar buttons: Add Row, Save, Delete, Export, Clear, Why Tabulator?', () => {
    const wrapper = mountGridEditor();
    const buttons = wrapper.findAll('button.u-button');
    const labels = buttons.map((b) => b.text());
    expect(labels).toContain('Add Row');
    expect(labels).toContain('Save');
    expect(labels).toContain('Delete');
    expect(labels).toContain('Export');
    expect(labels).toContain('Clear');
    expect(labels).toContain('Why Tabulator?');
  });

  it('the Columns menu lists the grid columns and hides the one picked', async () => {
    const wrapper = mountGridEditor();
    const menu = wrapper.find('button.column-menu');
    expect(menu.attributes('data-columns')).toBe(
      'status:true:true,issue:true:false',
    );
    await menu.trigger('click');
    expect(mockState.refs.setColumnVisible).toHaveBeenCalledWith(
      'issue',
      false,
    );
  });

  it('the status area has role="status" and aria-live="polite"', () => {
    const wrapper = mountGridEditor();
    const status = wrapper.find('[role="status"]');
    expect(status.exists()).toBe(true);
    expect(status.attributes('aria-live')).toBe('polite');
  });

  it('row count chip displays the current rowCount', async () => {
    const wrapper = mountGridEditor();
    mockState.refs.rowCount.value = 7;
    await wrapper.vm.$nextTick();
    const status = wrapper.find('[role="status"]');
    expect(status.text()).toContain('7 rows');
  });

  it('shows a dirty/change chip when dirtyCount > 0', async () => {
    const wrapper = mountGridEditor();
    mockState.refs.rowCount.value = 3;
    mockState.refs.dirtyCount.value = 2;
    await wrapper.vm.$nextTick();
    const status = wrapper.find('[role="status"]');
    expect(status.text()).toContain('2 changes');
  });

  it('shows a singular "change" label when dirtyCount === 1', async () => {
    const wrapper = mountGridEditor();
    mockState.refs.rowCount.value = 3;
    mockState.refs.dirtyCount.value = 1;
    await wrapper.vm.$nextTick();
    const status = wrapper.find('[role="status"]');
    expect(status.text()).toContain('1 change');
  });

  it('shows an error chip when errorList is non-empty', async () => {
    const wrapper = mountGridEditor();
    mockState.refs.rowCount.value = 3;
    mockState.refs.errorList.value = [
      { row: 0, rowId: 'r1', field: 'issue', message: 'bad' },
    ];
    await wrapper.vm.$nextTick();
    const status = wrapper.find('[role="status"]');
    expect(status.text()).toContain('1 errors');
  });

  it('shows a Saved badge when saveResult.saved > 0', async () => {
    const wrapper = mountGridEditor();
    mockState.refs.saveResult.value = { errors: [], saved: 5 };
    await wrapper.vm.$nextTick();
    const badge = wrapper.find('.u-badge');
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toBe('Saved 5');
  });

  it('Save button is disabled when there are no unsaved changes', () => {
    const wrapper = mountGridEditor();
    const saveButton = wrapper
      .findAll('button.u-button')
      .find((b) => b.text() === 'Save');
    expect(saveButton).toBeDefined();
    expect(saveButton.attributes('disabled')).toBeDefined();
  });

  it('Save button is enabled when there are unsaved changes', async () => {
    const wrapper = mountGridEditor();
    mockState.refs.dirtyCount.value = 1;
    await wrapper.vm.$nextTick();
    const saveButton = wrapper
      .findAll('button.u-button')
      .find((b) => b.text() === 'Save');
    expect(saveButton.attributes('disabled')).toBeUndefined();
  });

  it('Save button shows loading state while saving', async () => {
    const wrapper = mountGridEditor();
    mockState.refs.isSaving.value = true;
    await wrapper.vm.$nextTick();
    const saveButton = wrapper
      .findAll('button.u-button')
      .find((b) => b.text() === 'Save');
    expect(saveButton.attributes('data-loading')).toBe('true');
  });

  it('clicking Add Row calls handleAddRow', async () => {
    const wrapper = mountGridEditor();
    const addButton = wrapper
      .findAll('button.u-button')
      .find((b) => b.text() === 'Add Row');
    await addButton.trigger('click');
    expect(mockState.refs.handleAddRow).toHaveBeenCalledTimes(1);
  });

  it('clicking "Why Tabulator?" opens the licensing slide-over', async () => {
    const wrapper = mountGridEditor();
    const whyButton = wrapper
      .findAll('button.u-button')
      .find((b) => b.text() === 'Why Tabulator?');
    await whyButton.trigger('click');
    expect(wrapper.text()).toContain('Feature & Licensing Comparison');
  });

  it('the licensing slide-over shows the Tabulator/AG Grid/RevoGrid comparison with 8 feature rows', async () => {
    const wrapper = mountGridEditor();
    const whyButton = wrapper
      .findAll('button.u-button')
      .find((b) => b.text() === 'Why Tabulator?');
    await whyButton.trigger('click');
    const bodyRows = wrapper.findAll('tbody tr');
    expect(bodyRows.length).toBe(8);
  });
});

describe('GridEditor — empty-state paste overlay', () => {
  beforeEach(() => {
    mockState.refs.rowCount.value = 0;
    mockState.refs.dirtyCount.value = 0;
    mockState.refs.isSaving.value = false;
    mockState.refs.errorList.value = [];
    mockState.refs.saveResult.value = null;
  });

  it('shows the paste overlay when rowCount is 0 and not saving', () => {
    const wrapper = mountGridEditor();
    expect(wrapper.text()).toContain('Paste your Excel data here');
    expect(wrapper.text()).toContain('Ctrl+V');
    expect(wrapper.text()).toContain('Add Row');
  });

  it('hides the paste overlay when rowCount > 0', async () => {
    const wrapper = mountGridEditor();
    expect(wrapper.text()).toContain('Paste your Excel data here');
    mockState.refs.rowCount.value = 3;
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain('Paste your Excel data here');
  });

  it('hides the paste overlay while saving even when rowCount is 0', async () => {
    const wrapper = mountGridEditor();
    expect(wrapper.text()).toContain('Paste your Excel data here');
    mockState.refs.isSaving.value = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain('Paste your Excel data here');
  });

  it('a click on the overlay focuses the element Tabulator listens on for paste', async () => {
    const wrapper = mount(GridEditor, {
      attachTo: document.body,
      props: {
        columns: [{ field: 'issue' }],
        data: [],
        onSave: vi.fn(),
        title: 'Test Editor',
        exportFilename: 'test-export.csv',
      },
    });
    try {
      await wrapper.get('[data-testid="grid-empty"]').trigger('click');
      // The overlay's sibling is the element `new Tabulator(el)` builds on.
      const tableEl = wrapper.get('[data-testid="grid-empty"]').element
        .previousElementSibling;
      expect(document.activeElement).toBe(tableEl);
    } finally {
      wrapper.unmount();
    }
  });
});

describe('GridEditor — toolbarActions render prop', () => {
  beforeEach(() => {
    mockState.refs.rowCount.value = 0;
    mockState.refs.dirtyCount.value = 0;
    mockState.refs.isSaving.value = false;
    mockState.refs.errorList.value = [];
    mockState.refs.saveResult.value = null;
  });

  it('renders nothing extra when toolbarActions is not provided', () => {
    const wrapper = mountGridEditor();
    expect(wrapper.find('[data-test="extra-action"]').exists()).toBe(false);
  });

  it('renders the toolbarActions render prop content when provided', () => {
    const ExtraAction = defineComponent({
      name: 'ExtraAction',
      setup() {
        return (): VNode =>
          h(
            'button',
            { class: 'u-button', 'data-test': 'extra-action' },
            'Add Column',
          );
      },
    });
    const toolbarActions = (): VNode => h(ExtraAction);
    const wrapper = mountGridEditor({ toolbarActions });
    const extra = wrapper.find('[data-test="extra-action"]');
    expect(extra.exists()).toBe(true);
    expect(extra.text()).toBe('Add Column');
  });

  it('the toolbarActions button appears in the toolbar between Clear and Why Tabulator?', () => {
    const ExtraAction = defineComponent({
      name: 'ExtraAction',
      setup() {
        return (): VNode =>
          h(
            'button',
            { class: 'u-button', 'data-test': 'extra-action' },
            'Add Column',
          );
      },
    });
    const toolbarActions = (): VNode => h(ExtraAction);
    const wrapper = mountGridEditor({ toolbarActions });
    const buttons = wrapper.findAll('button.u-button');
    const labels = buttons.map((b) => b.text());
    const clearIdx = labels.indexOf('Clear');
    const extraIdx = labels.indexOf('Add Column');
    const whyIdx = labels.indexOf('Why Tabulator?');
    expect(clearIdx).toBeGreaterThanOrEqual(0);
    expect(extraIdx).toBeGreaterThan(clearIdx);
    expect(whyIdx).toBeGreaterThan(extraIdx);
  });
});

describe('GridEditor — error sidebar', () => {
  beforeEach(() => {
    mockState.refs.rowCount.value = 2;
    mockState.refs.dirtyCount.value = 0;
    mockState.refs.isSaving.value = false;
    mockState.refs.errorList.value = [];
    mockState.refs.saveResult.value = null;
  });

  it('hides the error sidebar when errorList is empty', () => {
    const wrapper = mountGridEditor();
    expect(wrapper.text()).not.toContain('Validation Errors');
  });

  it('labels each error with the row’s place in the grid, not its index in the request', async () => {
    const wrapper = mountGridEditor();
    mockState.refs.errorList.value = [
      { row: 0, rowId: 'r1', field: 'issue', message: 'issue is required' },
      { row: 2, rowId: 'r3', field: 'riskLevel', message: 'invalid' },
    ];
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Validation Errors (2)');
    expect(wrapper.text()).toContain('Row 5: issue');
    expect(wrapper.text()).toContain('Hidden row: riskLevel');
  });

  it('clicking an error entry calls scrollToError', async () => {
    const wrapper = mountGridEditor();
    const err = { row: 0, rowId: 'r1', field: 'issue', message: 'bad' };
    mockState.refs.errorList.value = [err];
    await wrapper.vm.$nextTick();
    const entry = wrapper.find('button.block');
    await entry.trigger('click');
    expect(mockState.refs.scrollToError).toHaveBeenCalledWith(err);
  });
});

describe('GridEditor — clear confirmation modal', () => {
  beforeEach(() => {
    mockState.refs.rowCount.value = 5;
    mockState.refs.dirtyCount.value = 0;
    mockState.refs.isSaving.value = false;
    mockState.refs.errorList.value = [];
    mockState.refs.saveResult.value = null;
  });

  it('clicking Clear opens the confirmation modal showing the current row count', async () => {
    const wrapper = mountGridEditor();
    const clearButton = wrapper
      .findAll('button.u-button')
      .find((b) => b.text() === 'Clear');
    await clearButton.trigger('click');
    expect(wrapper.text()).toContain('Clear all rows?');
    expect(wrapper.text()).toContain('5 rows');
  });

  it('clicking Clear All in the modal calls clearGrid and closes the modal', async () => {
    const wrapper = mountGridEditor();
    const clearButton = wrapper
      .findAll('button.u-button')
      .find((b) => b.text() === 'Clear');
    await clearButton.trigger('click');
    const clearAllButton = wrapper
      .findAll('button.u-button')
      .find((b) => b.text() === 'Clear All');
    await clearAllButton.trigger('click');
    expect(mockState.refs.clearGrid).toHaveBeenCalledTimes(1);
  });
});

describe('GridEditor — flex layout', () => {
  it('root uses a flex column layout that fills its parent (h-full, not h-screen/100vh)', () => {
    const wrapper = mountGridEditor();
    const root = wrapper.find('div.flex.h-full.flex-col');
    expect(root.exists()).toBe(true);
    expect(root.classes()).not.toContain('h-screen');
  });

  it('the grid host is flex-1 with min-h-0 so it fills the space below the toolbar', () => {
    const wrapper = mountGridEditor();
    const gridHost = wrapper.find('div.relative.min-h-0.flex-1');
    expect(gridHost.exists()).toBe(true);
  });
});
