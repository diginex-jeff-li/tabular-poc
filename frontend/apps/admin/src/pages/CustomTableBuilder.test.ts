import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { nextTick, defineComponent, h, type VNode } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import CustomTableBuilder from './CustomTableBuilder';

// ── Stub Nuxt UI components ──
// Mocking the Nuxt UI component paths the builder imports directly keeps the
// unit test isolated from the full Nuxt UI runtime (which injects router
// locations and app config that don't exist under vitest).

vi.mock('@nuxt/ui/components/Button.vue', () => ({
  default: defineComponent({
    name: 'UButton',
    props: {
      label: { type: String, default: '' },
      color: { type: String, default: '' },
      variant: { type: String, default: '' },
      size: { type: String, default: '' },
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

// ── Router helper ──

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/custom/new',
        component: CustomTableBuilder,
      },
      {
        path: '/custom/:tableId',
        component: defineComponent({
          name: 'EditorStub',
          setup: () => (): VNode => h('div', { 'data-test': 'editor' }),
        }),
      },
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

async function mountBuilder() {
  const router = makeRouter();
  await router.push('/custom/new');
  await router.isReady();
  const wrapper = mount(CustomTableBuilder, {
    global: {
      plugins: [router],
    },
  });
  await flushPromises();
  await nextTick();
  return { wrapper, router };
}

function getDefs(): Array<unknown> {
  const raw = localStorage.getItem('sc-table-defs');
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

describe('CustomTableBuilder', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ── VAL-BUILDER-002: Initial page structure ──
  describe('initial render', () => {
    it('renders a table name input (empty), zero column rows, Add Column and Create Table buttons', async () => {
      const { wrapper } = await mountBuilder();
      // Table name input exists and is empty
      const nameInput = wrapper.find('.table-name-field .u-input');
      expect(nameInput.exists()).toBe(true);
      expect(nameInput.attributes('value')).toBe('');
      // Zero rows in the tbody
      expect(wrapper.findAll('tbody tr')).toHaveLength(0);
      // Add Column button
      expect(wrapper.find('[data-label="Add Column"]').exists()).toBe(true);
      // Create Table button
      expect(wrapper.find('[data-label="Create Table"]').exists()).toBe(true);
    });
  });

  // ── VAL-BUILDER-003, VAL-BUILDER-005: Add Column ──
  describe('Add Column', () => {
    it('appends a row with default type Text, required unchecked, and no choices input', async () => {
      const { wrapper } = await mountBuilder();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const rows = wrapper.findAll('tbody tr');
      expect(rows).toHaveLength(1);
      // Type select defaults to 'text'
      const select = rows[0].find('.u-select');
      expect(select.exists()).toBe(true);
      expect(select.attributes('value')).toBe('text');
      // Required checkbox unchecked
      const checkbox = rows[0].find('.u-checkbox');
      expect(checkbox.exists()).toBe(true);
      expect(checkbox.attributes('checked')).toBeFalsy();
      // No choices input (only visible for dropdown)
      const inputs = rows[0].findAll('.u-input');
      expect(inputs).toHaveLength(1); // just the name input
    });

    it('appends multiple rows, each independently editable', async () => {
      const { wrapper } = await mountBuilder();
      // Add three columns
      for (let i = 0; i < 3; i++) {
        await wrapper.find('[data-label="Add Column"]').trigger('click');
        await nextTick();
      }
      expect(wrapper.findAll('tbody tr')).toHaveLength(3);
      // Set name on row 1
      const rows = wrapper.findAll('tbody tr');
      await rows[0].findAll('.u-input')[0].setValue('Alpha');
      await nextTick();
      // Row 2 name should still be empty
      const rowsAfter = wrapper.findAll('tbody tr');
      expect(rowsAfter[1].findAll('.u-input')[0].attributes('value')).toBe('');
      expect(rowsAfter[0].findAll('.u-input')[0].attributes('value')).toBe(
        'Alpha',
      );
    });
  });

  // ── VAL-BUILDER-006: Remove button ──
  describe('Remove button', () => {
    it('deletes its own row without corrupting others', async () => {
      const { wrapper } = await mountBuilder();
      // Add two rows
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const rows = wrapper.findAll('tbody tr');
      await rows[0].findAll('.u-input')[0].setValue('A');
      await rows[1].findAll('.u-input')[0].setValue('B');
      await nextTick();
      // Remove row 0
      const removeBtns = wrapper.findAll('[data-label="Remove"]');
      await removeBtns[0].trigger('click');
      await nextTick();
      const remaining = wrapper.findAll('tbody tr');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].findAll('.u-input')[0].attributes('value')).toBe('B');
    });

    it('removing the only row leaves zero rows', async () => {
      const { wrapper } = await mountBuilder();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      await wrapper.find('[data-label="Remove"]').trigger('click');
      await nextTick();
      expect(wrapper.findAll('tbody tr')).toHaveLength(0);
    });
  });

  // ── VAL-BUILDER-007: Dropdown reveals/hides choices ──
  describe('type change and choices', () => {
    it('reveals choices input when type is Dropdown and hides it otherwise', async () => {
      const { wrapper } = await mountBuilder();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const row = wrapper.findAll('tbody tr')[0];
      // Initially text — no choices input
      expect(row.findAll('.u-input')).toHaveLength(1);
      // Change to dropdown
      await row.find('.u-select').setValue('dropdown');
      await nextTick();
      const rowAfter = wrapper.findAll('tbody tr')[0];
      expect(rowAfter.findAll('.u-input')).toHaveLength(2); // name + choices
      // Change back to text
      await rowAfter.find('.u-select').setValue('text');
      await nextTick();
      const rowFinal = wrapper.findAll('tbody tr')[0];
      expect(rowFinal.findAll('.u-input')).toHaveLength(1);
    });

    it('choices value survives a type round-trip', async () => {
      const { wrapper } = await mountBuilder();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      // Set type to dropdown
      let row = wrapper.findAll('tbody tr')[0];
      await row.find('.u-select').setValue('dropdown');
      await nextTick();
      // Enter choices
      row = wrapper.findAll('tbody tr')[0];
      const choicesInput = row.findAll('.u-input')[1];
      await choicesInput.setValue('Red, Green, Blue');
      await nextTick();
      // Switch to text and back
      row = wrapper.findAll('tbody tr')[0];
      await row.find('.u-select').setValue('text');
      await nextTick();
      row = wrapper.findAll('tbody tr')[0];
      await row.find('.u-select').setValue('dropdown');
      await nextTick();
      row = wrapper.findAll('tbody tr')[0];
      const choicesAfter = row.findAll('.u-input')[1];
      expect(choicesAfter.attributes('value')).toBe('Red, Green, Blue');
    });
  });

  // ── VAL-BUILDER-009: Required checkbox ──
  describe('Required checkbox', () => {
    it('toggles independently per row', async () => {
      const { wrapper } = await mountBuilder();
      // Add two rows
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const rows = wrapper.findAll('tbody tr');
      // Check row 0's checkbox
      await rows[0].find('.u-checkbox').setValue(true);
      await nextTick();
      const rowsAfter = wrapper.findAll('tbody tr');
      expect(rowsAfter[0].find('.u-checkbox').attributes('data-model')).toBe(
        'true',
      );
      expect(rowsAfter[1].find('.u-checkbox').attributes('data-model')).toBe(
        'false',
      );
    });
  });

  // ── Validation rules ──
  describe('validation — empty table name (VAL-BUILDER-010)', () => {
    it('blocks creation with a visible message and writes nothing to storage', async () => {
      const { wrapper } = await mountBuilder();
      // Add a valid column but leave table name empty
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const row = wrapper.findAll('tbody tr')[0];
      await row.findAll('.u-input')[0].setValue('Title');
      await nextTick();
      // Click Create Table
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await nextTick();
      // Error is visible
      const errorBox = wrapper.find('[data-testid="validation-errors"]');
      expect(errorBox.exists()).toBe(true);
      expect(errorBox.text().toLowerCase()).toContain('table name');
      // Nothing in storage
      expect(getDefs()).toHaveLength(0);
    });

    it('blocks creation with whitespace-only table name', async () => {
      const { wrapper } = await mountBuilder();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      // Set whitespace table name
      await wrapper.find('.table-name-field .u-input').setValue('   ');
      await nextTick();
      const row = wrapper.findAll('tbody tr')[0];
      await row.findAll('.u-input')[0].setValue('Title');
      await nextTick();
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await nextTick();
      expect(wrapper.find('[data-testid="validation-errors"]').exists()).toBe(
        true,
      );
      expect(getDefs()).toHaveLength(0);
    });
  });

  describe('validation — zero columns (VAL-BUILDER-011)', () => {
    it('blocks creation with a visible message about at least one column', async () => {
      const { wrapper } = await mountBuilder();
      // Set a valid table name but no columns
      await wrapper.find('.table-name-field .u-input').setValue('My Table');
      await nextTick();
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await nextTick();
      const errorBox = wrapper.find('[data-testid="validation-errors"]');
      expect(errorBox.exists()).toBe(true);
      expect(errorBox.text().toLowerCase()).toContain('column');
      expect(getDefs()).toHaveLength(0);
    });
  });

  describe('validation — empty column name (VAL-BUILDER-012)', () => {
    it('blocks creation with a visible message', async () => {
      const { wrapper } = await mountBuilder();
      await wrapper.find('.table-name-field .u-input').setValue('My Table');
      await nextTick();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      // Leave column name empty
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await nextTick();
      const errorBox = wrapper.find('[data-testid="validation-errors"]');
      expect(errorBox.exists()).toBe(true);
      expect(errorBox.text().toLowerCase()).toContain('name');
      expect(getDefs()).toHaveLength(0);
    });

    it('blocks creation with whitespace-only column name', async () => {
      const { wrapper } = await mountBuilder();
      await wrapper.find('.table-name-field .u-input').setValue('My Table');
      await nextTick();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const row = wrapper.findAll('tbody tr')[0];
      await row.findAll('.u-input')[0].setValue('  ');
      await nextTick();
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await nextTick();
      expect(wrapper.find('[data-testid="validation-errors"]').exists()).toBe(
        true,
      );
      expect(getDefs()).toHaveLength(0);
    });
  });

  describe('validation — duplicate column names (VAL-BUILDER-013)', () => {
    it('blocks creation for exact duplicate names', async () => {
      const { wrapper } = await mountBuilder();
      await wrapper.find('.table-name-field .u-input').setValue('My Table');
      await nextTick();
      // Add two columns with the same name
      for (let i = 0; i < 2; i++) {
        await wrapper.find('[data-label="Add Column"]').trigger('click');
        await nextTick();
      }
      const rows = wrapper.findAll('tbody tr');
      await rows[0].findAll('.u-input')[0].setValue('Name');
      await rows[1].findAll('.u-input')[0].setValue('Name');
      await nextTick();
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await nextTick();
      const errorBox = wrapper.find('[data-testid="validation-errors"]');
      expect(errorBox.exists()).toBe(true);
      expect(errorBox.text().toLowerCase()).toContain('duplicate');
      expect(getDefs()).toHaveLength(0);
    });

    it('blocks creation for case-insensitive duplicates with trailing whitespace', async () => {
      const { wrapper } = await mountBuilder();
      await wrapper.find('.table-name-field .u-input').setValue('My Table');
      await nextTick();
      for (let i = 0; i < 2; i++) {
        await wrapper.find('[data-label="Add Column"]').trigger('click');
        await nextTick();
      }
      const rows = wrapper.findAll('tbody tr');
      await rows[0].findAll('.u-input')[0].setValue('Status');
      await rows[1].findAll('.u-input')[0].setValue('status ');
      await nextTick();
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await nextTick();
      const errorBox = wrapper.find('[data-testid="validation-errors"]');
      expect(errorBox.exists()).toBe(true);
      expect(errorBox.text().toLowerCase()).toContain('duplicate');
      expect(getDefs()).toHaveLength(0);
    });
  });

  describe('validation — reserved names (VAL-BUILDER-014)', () => {
    it('blocks creation for each reserved name (case-insensitive)', async () => {
      const reserved = ['id', 'ID', 'createdAt', 'updatedAt', '__select'];
      for (const name of reserved) {
        localStorage.clear();
        const { wrapper } = await mountBuilder();
        await wrapper.find('.table-name-field .u-input').setValue('My Table');
        await nextTick();
        await wrapper.find('[data-label="Add Column"]').trigger('click');
        await nextTick();
        const row = wrapper.findAll('tbody tr')[0];
        await row.findAll('.u-input')[0].setValue(name);
        await nextTick();
        await wrapper.find('[data-label="Create Table"]').trigger('click');
        await nextTick();
        const errorBox = wrapper.find('[data-testid="validation-errors"]');
        expect(errorBox.exists()).toBe(true);
        expect(errorBox.text().toLowerCase()).toContain('reserved');
        expect(getDefs()).toHaveLength(0);
        wrapper.unmount();
      }
    });
  });

  describe('validation — dropdown with zero choices (VAL-BUILDER-015)', () => {
    it('blocks creation for a dropdown with empty choices', async () => {
      const { wrapper } = await mountBuilder();
      await wrapper.find('.table-name-field .u-input').setValue('My Table');
      await nextTick();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const row = wrapper.findAll('tbody tr')[0];
      await row.findAll('.u-input')[0].setValue('Status');
      await row.find('.u-select').setValue('dropdown');
      await nextTick();
      // Leave choices empty
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await nextTick();
      const errorBox = wrapper.find('[data-testid="validation-errors"]');
      expect(errorBox.exists()).toBe(true);
      expect(errorBox.text().toLowerCase()).toContain('choice');
      expect(getDefs()).toHaveLength(0);
    });

    it('blocks creation for a dropdown with only commas and spaces', async () => {
      const { wrapper } = await mountBuilder();
      await wrapper.find('.table-name-field .u-input').setValue('My Table');
      await nextTick();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const row = wrapper.findAll('tbody tr')[0];
      await row.findAll('.u-input')[0].setValue('Status');
      await row.find('.u-select').setValue('dropdown');
      await nextTick();
      const rowAfter = wrapper.findAll('tbody tr')[0];
      await rowAfter.findAll('.u-input')[1].setValue(', , ,');
      await nextTick();
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await nextTick();
      expect(wrapper.find('[data-testid="validation-errors"]').exists()).toBe(
        true,
      );
      expect(getDefs()).toHaveLength(0);
    });
  });

  // ── VAL-BUILDER-025: Multiple errors reported together ──
  describe('multiple validation errors', () => {
    it('reports multiple errors simultaneously', async () => {
      const { wrapper } = await mountBuilder();
      // No table name, two columns both named "X"
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const rows = wrapper.findAll('tbody tr');
      await rows[0].findAll('.u-input')[0].setValue('X');
      await rows[1].findAll('.u-input')[0].setValue('X');
      await nextTick();
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await nextTick();
      const errorBox = wrapper.find('[data-testid="validation-errors"]');
      expect(errorBox.exists()).toBe(true);
      const text = errorBox.text().toLowerCase();
      // At minimum: table name required + duplicate column names
      expect(text).toContain('table name');
      expect(text).toContain('duplicate');
    });
  });

  // ── VAL-BUILDER-016: Recovery — fix and retry ──
  describe('validation recovery', () => {
    it('clears errors and succeeds after fixing the problem', async () => {
      const { wrapper, router } = await mountBuilder();
      // Add a valid column but no table name
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const row = wrapper.findAll('tbody tr')[0];
      await row.findAll('.u-input')[0].setValue('Title');
      await nextTick();
      // Attempt creation — fails
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await nextTick();
      expect(wrapper.find('[data-testid="validation-errors"]').exists()).toBe(
        true,
      );
      // Fix: enter table name
      await wrapper.find('.table-name-field .u-input').setValue('Fixed Table');
      await nextTick();
      // Error should be cleared (clears on input)
      expect(wrapper.find('[data-testid="validation-errors"]').exists()).toBe(
        false,
      );
      // Retry creation — succeeds
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await flushPromises();
      await nextTick();
      expect(router.currentRoute.value.path).toMatch(/^\/custom\/[0-9a-f-]+$/);
      expect(getDefs()).toHaveLength(1);
    });
  });

  // ── VAL-BUILDER-017, VAL-BUILDER-018: Successful creation ──
  describe('successful creation', () => {
    it('redirects to /custom/:tableId', async () => {
      const { wrapper, router } = await mountBuilder();
      await wrapper.find('.table-name-field .u-input').setValue('Test Table');
      await nextTick();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const row = wrapper.findAll('tbody tr')[0];
      await row.findAll('.u-input')[0].setValue('Title');
      await nextTick();
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await flushPromises();
      await nextTick();
      expect(router.currentRoute.value.path).toMatch(/^\/custom\/[0-9a-f-]+$/);
    });

    it('persists a definition with the right name, columns, uuid ids, and timestamps', async () => {
      const { wrapper } = await mountBuilder();
      await wrapper.find('.table-name-field .u-input').setValue('My Schema');
      await nextTick();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const row = wrapper.findAll('tbody tr')[0];
      await row.findAll('.u-input')[0].setValue('Title');
      await nextTick();
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await flushPromises();
      await nextTick();
      const defs = getDefs() as Array<Record<string, unknown>>;
      expect(defs).toHaveLength(1);
      const def = defs[0];
      expect(def.name).toBe('My Schema');
      expect(def.id).toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
      );
      expect(def.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(def.updatedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
      const cols = def.columns as Array<Record<string, unknown>>;
      expect(cols).toHaveLength(1);
      expect(cols[0].id).toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
      );
      expect(cols[0].name).toBe('Title');
      expect(cols[0].type).toBe('text');
      expect(cols[0].required).toBe(false);
      expect(cols[0].choices).toEqual([]);
    });
  });

  // ── VAL-BUILDER-019: Column order and types ──
  describe('column order and types', () => {
    it('persists columns in the entered order with correct types', async () => {
      const { wrapper } = await mountBuilder();
      await wrapper.find('.table-name-field .u-input').setValue('Ordered');
      await nextTick();
      // Add three columns: Text, Dropdown, Number
      for (let i = 0; i < 3; i++) {
        await wrapper.find('[data-label="Add Column"]').trigger('click');
        await nextTick();
      }
      const rows = wrapper.findAll('tbody tr');
      await rows[0].findAll('.u-input')[0].setValue('Name');
      await rows[1].findAll('.u-input')[0].setValue('Category');
      await rows[1].find('.u-select').setValue('dropdown');
      await nextTick();
      const rowsAfter1 = wrapper.findAll('tbody tr');
      await rowsAfter1[1].findAll('.u-input')[1].setValue('A, B, C');
      await rowsAfter1[2].findAll('.u-input')[0].setValue('Priority');
      await rowsAfter1[2].find('.u-select').setValue('number');
      await nextTick();
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await flushPromises();
      await nextTick();
      const defs = getDefs() as Array<Record<string, unknown>>;
      const cols = defs[0].columns as Array<Record<string, unknown>>;
      expect(cols).toHaveLength(3);
      expect(cols[0].name).toBe('Name');
      expect(cols[0].type).toBe('text');
      expect(cols[1].name).toBe('Category');
      expect(cols[1].type).toBe('dropdown');
      expect(cols[1].choices).toEqual(['A', 'B', 'C']);
      expect(cols[2].name).toBe('Priority');
      expect(cols[2].type).toBe('number');
    });
  });

  // ── VAL-BUILDER-008: Choices parsing ──
  describe('choices parsing', () => {
    it('trims whitespace and drops empties for " Apple , Banana "', async () => {
      const { wrapper } = await mountBuilder();
      await wrapper.find('.table-name-field .u-input').setValue('T');
      await nextTick();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const row = wrapper.findAll('tbody tr')[0];
      await row.findAll('.u-input')[0].setValue('Fruit');
      await row.find('.u-select').setValue('dropdown');
      await nextTick();
      const rowAfter = wrapper.findAll('tbody tr')[0];
      await rowAfter.findAll('.u-input')[1].setValue(' Apple , Banana ');
      await nextTick();
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await flushPromises();
      await nextTick();
      const defs = getDefs() as Array<Record<string, unknown>>;
      const cols = defs[0].columns as Array<Record<string, unknown>>;
      expect(cols[0].choices).toEqual(['Apple', 'Banana']);
    });

    it('"a, ,b," yields exactly ["a", "b"]', async () => {
      const { wrapper } = await mountBuilder();
      await wrapper.find('.table-name-field .u-input').setValue('T');
      await nextTick();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const row = wrapper.findAll('tbody tr')[0];
      await row.findAll('.u-input')[0].setValue('Tag');
      await row.find('.u-select').setValue('dropdown');
      await nextTick();
      const rowAfter = wrapper.findAll('tbody tr')[0];
      await rowAfter.findAll('.u-input')[1].setValue('a, ,b,');
      await nextTick();
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await flushPromises();
      await nextTick();
      const defs = getDefs() as Array<Record<string, unknown>>;
      const cols = defs[0].columns as Array<Record<string, unknown>>;
      expect(cols[0].choices).toEqual(['a', 'b']);
    });

    it('a single choice "Only" yields ["Only"] and is valid', async () => {
      const { wrapper } = await mountBuilder();
      await wrapper.find('.table-name-field .u-input').setValue('T');
      await nextTick();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const row = wrapper.findAll('tbody tr')[0];
      await row.findAll('.u-input')[0].setValue('Single');
      await row.find('.u-select').setValue('dropdown');
      await nextTick();
      const rowAfter = wrapper.findAll('tbody tr')[0];
      await rowAfter.findAll('.u-input')[1].setValue('Only');
      await nextTick();
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await flushPromises();
      await nextTick();
      const defs = getDefs() as Array<Record<string, unknown>>;
      const cols = defs[0].columns as Array<Record<string, unknown>>;
      expect(cols[0].choices).toEqual(['Only']);
    });
  });

  // ── VAL-BUILDER-021: Multiple tables — no overwrite ──
  describe('multiple tables', () => {
    it('creating a second table does not overwrite the first', async () => {
      // First table
      const { wrapper: w1 } = await mountBuilder();
      await w1.find('.table-name-field .u-input').setValue('Table A');
      await nextTick();
      await w1.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const row1 = w1.findAll('tbody tr')[0];
      await row1.findAll('.u-input')[0].setValue('Col1');
      await nextTick();
      await w1.find('[data-label="Create Table"]').trigger('click');
      await flushPromises();
      await nextTick();
      w1.unmount();
      expect(getDefs()).toHaveLength(1);

      // Second table
      const { wrapper: w2 } = await mountBuilder();
      // Need to navigate the same router or a new one
      await w2.find('.table-name-field .u-input').setValue('Table B');
      await nextTick();
      await w2.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      await w2.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const rows2 = w2.findAll('tbody tr');
      await rows2[0].findAll('.u-input')[0].setValue('X');
      await rows2[1].findAll('.u-input')[0].setValue('Y');
      await nextTick();
      await w2.find('[data-label="Create Table"]').trigger('click');
      await flushPromises();
      await nextTick();
      const defs = getDefs() as Array<Record<string, unknown>>;
      expect(defs).toHaveLength(2);
      expect(defs[0].name).toBe('Table A');
      expect(defs[1].name).toBe('Table B');
      w2.unmount();
    });

    it('allows two tables with the same name', async () => {
      const { wrapper: w1 } = await mountBuilder();
      await w1.find('.table-name-field .u-input').setValue('My Table');
      await nextTick();
      await w1.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const row1 = w1.findAll('tbody tr')[0];
      await row1.findAll('.u-input')[0].setValue('Col1');
      await nextTick();
      await w1.find('[data-label="Create Table"]').trigger('click');
      await flushPromises();
      await nextTick();
      w1.unmount();

      const { wrapper: w2 } = await mountBuilder();
      await w2.find('.table-name-field .u-input').setValue('My Table');
      await nextTick();
      await w2.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const row2 = w2.findAll('tbody tr')[0];
      await row2.findAll('.u-input')[0].setValue('Col2');
      await nextTick();
      await w2.find('[data-label="Create Table"]').trigger('click');
      await flushPromises();
      await nextTick();
      const defs = getDefs() as Array<Record<string, unknown>>;
      expect(defs).toHaveLength(2);
      expect(defs[0].name).toBe('My Table');
      expect(defs[1].name).toBe('My Table');
      expect(defs[0].id).not.toBe(defs[1].id);
      w2.unmount();
    });
  });

  // ── VAL-BUILDER-022: Navigating away writes nothing ──
  describe('navigating away without creating', () => {
    it('writes nothing to storage', async () => {
      const { wrapper, router } = await mountBuilder();
      await wrapper.find('.table-name-field .u-input').setValue('Unsaved');
      await nextTick();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const row = wrapper.findAll('tbody tr')[0];
      await row.findAll('.u-input')[0].setValue('Title');
      await nextTick();
      // Navigate away (back to /custom)
      await router.push('/custom');
      await flushPromises();
      await nextTick();
      expect(getDefs()).toHaveLength(0);
    });
  });

  // ── VAL-BUILDER-023: Creating does not disturb existing definitions ──
  describe('creating does not disturb existing definitions', () => {
    it('leaves pre-existing definitions unchanged', async () => {
      // Seed an existing table
      const existing = {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Existing',
        columns: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            name: 'Old',
            type: 'text',
            required: true,
            choices: [] as Array<string>,
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      localStorage.setItem('sc-table-defs', JSON.stringify([existing]));

      const { wrapper } = await mountBuilder();
      await wrapper.find('.table-name-field .u-input').setValue('New Table');
      await nextTick();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const row = wrapper.findAll('tbody tr')[0];
      await row.findAll('.u-input')[0].setValue('NewCol');
      await nextTick();
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await flushPromises();
      await nextTick();

      const defs = getDefs() as Array<Record<string, unknown>>;
      expect(defs).toHaveLength(2);
      // The existing one is unchanged
      const old = defs.find((d) => d.id === existing.id);
      expect(old).toBeDefined();
      expect(old!.name).toBe('Existing');
      expect(old!.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(old!.updatedAt).toBe('2026-01-01T00:00:00.000Z');
      const oldCols = old!.columns as Array<Record<string, unknown>>;
      expect(oldCols[0].name).toBe('Old');
    });
  });

  // ── VAL-BUILDER-024: Column order preserved ──
  describe('column order preserved', () => {
    it('persists columns in non-alphabetical order as entered', async () => {
      const { wrapper } = await mountBuilder();
      await wrapper.find('.table-name-field .u-input').setValue('ZAM');
      await nextTick();
      for (let i = 0; i < 3; i++) {
        await wrapper.find('[data-label="Add Column"]').trigger('click');
        await nextTick();
      }
      const rows = wrapper.findAll('tbody tr');
      await rows[0].findAll('.u-input')[0].setValue('Z');
      await rows[1].findAll('.u-input')[0].setValue('A');
      await rows[2].findAll('.u-input')[0].setValue('M');
      await nextTick();
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await flushPromises();
      await nextTick();
      const defs = getDefs() as Array<Record<string, unknown>>;
      const cols = defs[0].columns as Array<Record<string, unknown>>;
      expect(cols.map((c) => c.name)).toEqual(['Z', 'A', 'M']);
    });
  });

  // ── VAL-BUILDER-004: Table name preserved ──
  describe('table name preserved', () => {
    it('preserves internal spaces and unicode characters exactly', async () => {
      const { wrapper } = await mountBuilder();
      const name = 'Résumé Überprüfung';
      await wrapper.find('.table-name-field .u-input').setValue(name);
      await nextTick();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const row = wrapper.findAll('tbody tr')[0];
      await row.findAll('.u-input')[0].setValue('Title');
      await nextTick();
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await flushPromises();
      await nextTick();
      const defs = getDefs() as Array<Record<string, unknown>>;
      expect(defs[0].name).toBe(name);
    });

    it('preserves internal spaces in "Vendor Risk Register"', async () => {
      const { wrapper } = await mountBuilder();
      const name = 'Vendor Risk Register';
      await wrapper.find('.table-name-field .u-input').setValue(name);
      await nextTick();
      await wrapper.find('[data-label="Add Column"]').trigger('click');
      await nextTick();
      const row = wrapper.findAll('tbody tr')[0];
      await row.findAll('.u-input')[0].setValue('Title');
      await nextTick();
      await wrapper.find('[data-label="Create Table"]').trigger('click');
      await flushPromises();
      await nextTick();
      const defs = getDefs() as Array<Record<string, unknown>>;
      expect(defs[0].name).toBe(name);
    });
  });
});
