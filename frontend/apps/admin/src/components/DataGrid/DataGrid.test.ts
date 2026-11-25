import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, it, expect, vi } from 'vite-plus/test';
import DataGrid from './DataGrid';
import type { VueWrapper } from '@vue/test-utils';
import type { GridColumn } from 'utils/zodToColumnDefs';

const COLUMNS: Array<GridColumn> = [
  {
    id: 'topic',
    title: 'Topic',
    editor: 'text',
    filter: 'text',
    paste: true,
    export: true,
    validate: (value) => (value ? null : 'Required'),
  },
  {
    id: 'risk',
    title: 'Risk',
    editor: 'choice',
    options: ['High', 'Medium', 'Low'],
    filter: 'choice',
    paste: true,
    export: true,
    validate: () => null,
  },
];

const DATA = [
  { id: 'r1', topic: 'Child labor', risk: 'Low' },
  { id: 'r2', topic: 'Wages', risk: 'High' },
  { id: 'r3', topic: 'Air quality', risk: 'High' },
];

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function mountGrid(
  onSave = vi.fn(async () => ({ errors: [], saved: 0 })),
  extra: Record<string, unknown> = {},
) {
  wrapper = mount(DataGrid, {
    attachTo: document.body,
    props: {
      columns: COLUMNS,
      data: DATA,
      onSave,
      title: 'Grid',
      exportFilename: 'grid.csv',
      ...extra,
    },
  });
  return { wrapper, onSave };
}

function cell(w: VueWrapper, rowId: string, colId: string) {
  return w.get(`[data-row-id="${rowId}"][data-col-id="${colId}"]`);
}

/** The grid's focus target, which receives keys and clipboard events. */
function root(w: VueWrapper) {
  return w.get('[data-slot="root"][tabindex]');
}

async function editCell(w: VueWrapper, rowId: string, colId: string) {
  await cell(w, rowId, colId).trigger('dblclick');
  return cell(w, rowId, colId).get('[data-grid-editor] input');
}

/** Topics of the body rows, top to bottom, as a person sees them. */
function visibleTopics(w: VueWrapper): Array<string> {
  return w.findAll('[data-col-id="topic"]').map((cell) => cell.text());
}

function button(w: VueWrapper, label: string) {
  return w.findAll('button').find((b) => b.text() === label);
}

describe('DataGrid', () => {
  it('cycles a column sort asc, desc, then back to the original order', async () => {
    const { wrapper: w } = mountGrid();
    const sort = () =>
      w.get('button[aria-label^="Sort Topic"]').trigger('click');
    expect(visibleTopics(w)).toEqual(['Child labor', 'Wages', 'Air quality']);

    await sort();
    expect(visibleTopics(w)).toEqual(['Air quality', 'Child labor', 'Wages']);
    await sort();
    expect(visibleTopics(w)).toEqual(['Wages', 'Child labor', 'Air quality']);
    await sort();
    expect(visibleTopics(w)).toEqual(['Child labor', 'Wages', 'Air quality']);
    expect(w.get('th[aria-sort]').attributes('aria-sort')).toBe('none');
  });

  it('filters by an enum value and shows every row again once cleared', async () => {
    const { wrapper: w } = mountGrid();
    await w.get('[aria-label="Filter Risk"]').trigger('click');
    await flushPromises();
    const low = [...document.body.querySelectorAll('[role="option"]')].find(
      (option) => option.textContent?.trim() === 'Low',
    ) as HTMLElement;
    low.click();
    await flushPromises();
    expect(visibleTopics(w)).toEqual(['Child labor']);

    await w
      .get('[aria-label="Filter Risk"] [data-slot="trailingClear"]')
      .trigger('click');
    await flushPromises();
    expect(visibleTopics(w)).toEqual(['Child labor', 'Wages', 'Air quality']);
  });

  it('filters text columns case-insensitively by substring', async () => {
    const { wrapper: w } = mountGrid();
    await w.get('input[aria-label="Filter Topic"]').setValue('LAB');
    expect(visibleTopics(w)).toEqual(['Child labor']);
  });

  it('deletes ticked rows, counts the changes and saves them as deletes', async () => {
    const { wrapper: w, onSave } = mountGrid();
    const boxes = w.findAll('[role="checkbox"][aria-label="Select row"]');
    await boxes[0].trigger('click');
    await boxes[2].trigger('click');
    // A click on a data cell never selects its row.
    await w.get('[data-row-id="r2"][data-col-id="topic"]').trigger('click');

    await button(w, 'Delete').trigger('click');
    expect(visibleTopics(w)).toEqual(['Wages']);
    expect(w.get('[role="status"]').text()).toContain('2 changes');

    await button(w, 'Save').trigger('click');
    await flushPromises();
    expect(onSave).toHaveBeenCalledWith({ upserts: [], deletes: ['r1', 'r3'] });
    expect(w.get('[role="status"]').text()).not.toContain('changes');
  });

  it('select-all ticks only the rows the filters let through', async () => {
    const { wrapper: w } = mountGrid();
    await w.get('input[aria-label="Filter Topic"]').setValue('w');
    expect(visibleTopics(w)).toEqual(['Wages']);
    await w.get('[aria-label="Select all rows"]').trigger('click');
    await w.get('input[aria-label="Filter Topic"]').setValue('');
    await button(w, 'Delete').trigger('click');
    expect(visibleTopics(w)).toEqual(['Child labor', 'Air quality']);
  });
});

describe('DataGrid editing', () => {
  it('Escape closes the editor and keeps the old value', async () => {
    const onUserEdit = vi.fn();
    const { wrapper: w } = mountGrid(undefined, { onUserEdit });
    const input = await editCell(w, 'r2', 'topic');
    expect((input.element as HTMLInputElement).value).toBe('Wages');
    await input.setValue('Overtime');
    await input.trigger('keydown', { key: 'Escape' });

    expect(cell(w, 'r2', 'topic').text()).toBe('Wages');
    expect(w.find('[data-grid-editor]').exists()).toBe(false);
    expect(onUserEdit).not.toHaveBeenCalled();
  });

  it('Enter commits through normalizeRow, reports the row once and moves down', async () => {
    const onUserEdit = vi.fn();
    const normalizeRow = vi.fn((row: Record<string, unknown>) => ({
      ...row,
      topic: String(row.topic).trim(),
    }));
    const { wrapper: w } = mountGrid(undefined, { onUserEdit, normalizeRow });
    const input = await editCell(w, 'r1', 'topic');
    await input.setValue('  Forced labor ');
    await input.trigger('keydown', { key: 'Enter' });

    expect(normalizeRow).toHaveBeenCalledWith({
      id: 'r1',
      topic: '  Forced labor ',
      risk: 'Low',
    });
    expect(cell(w, 'r1', 'topic').text()).toBe('Forced labor');
    expect(onUserEdit).toHaveBeenCalledTimes(1);
    expect(onUserEdit).toHaveBeenCalledWith(['r1']);
    expect(cell(w, 'r2', 'topic').attributes('aria-selected')).toBe('true');
    expect(w.get('[role="status"]').text()).toContain('1 change');
  });

  it('shows a cleared required cell as invalid without saving', async () => {
    const { wrapper: w, onSave } = mountGrid();
    expect(cell(w, 'r3', 'topic').attributes('aria-invalid')).toBeUndefined();
    const input = await editCell(w, 'r3', 'topic');
    await input.setValue('');
    await input.trigger('keydown', { key: 'Enter' });

    const cleared = cell(w, 'r3', 'topic');
    expect(cleared.attributes('aria-invalid')).toBe('true');
    expect(cleared.attributes('title')).toBe('Required');
    expect(cleared.classes()).toContain('ring-error');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('typing on the active cell replaces its value, as in Excel', async () => {
    const { wrapper: w } = mountGrid();
    await cell(w, 'r2', 'topic').trigger('pointerdown', { button: 0 });
    await root(w).trigger('keydown', { key: 'P' });
    const input = cell(w, 'r2', 'topic').get('[data-grid-editor] input');
    expect((input.element as HTMLInputElement).value).toBe('P');
    await input.setValue('Pay');
    await input.trigger('keydown', { key: 'Tab' });

    expect(cell(w, 'r2', 'topic').text()).toBe('Pay');
    expect(cell(w, 'r2', 'risk').attributes('aria-selected')).toBe('true');
  });

  it('commits a choice picked from the open menu', async () => {
    const onUserEdit = vi.fn();
    const { wrapper: w } = mountGrid(undefined, { onUserEdit });
    await cell(w, 'r1', 'risk').trigger('dblclick');
    await flushPromises();
    const options = [...document.body.querySelectorAll('[role="option"]')];
    expect(options.map((o) => o.textContent?.trim())).toEqual([
      'High',
      'Medium',
      'Low',
    ]);
    (options[1] as HTMLElement).click();
    await flushPromises();

    expect(cell(w, 'r1', 'risk').text()).toBe('Medium');
    expect(onUserEdit).toHaveBeenCalledWith(['r1']);
  });
});

describe('DataGrid selection', () => {
  it('moves the active cell with arrows and grows a range with Shift', async () => {
    const { wrapper: w } = mountGrid();
    await cell(w, 'r1', 'topic').trigger('pointerdown', { button: 0 });
    await root(w).trigger('keydown', { key: 'ArrowDown' });
    await root(w).trigger('keydown', { key: 'ArrowRight', shiftKey: true });
    await root(w).trigger('keydown', { key: 'ArrowDown', shiftKey: true });

    const selected = w
      .findAll('[aria-selected="true"]')
      .map(
        (c) => `${c.attributes('data-row-id')}:${c.attributes('data-col-id')}`,
      );
    expect(selected).toEqual(['r2:topic', 'r2:risk', 'r3:topic', 'r3:risk']);
  });

  it('never moves the active cell for keys typed in a header filter', async () => {
    const { wrapper: w } = mountGrid();
    await cell(w, 'r1', 'topic').trigger('pointerdown', { button: 0 });
    const filter = w.get('input[aria-label="Filter Topic"]');
    await filter.trigger('keydown', { key: 'ArrowDown' });
    await filter.trigger('keydown', { key: 'x' });

    expect(cell(w, 'r1', 'topic').attributes('aria-selected')).toBe('true');
    expect(cell(w, 'r2', 'topic').attributes('aria-selected')).toBe('false');
    expect(w.find('[data-grid-editor]').exists()).toBe(false);
  });

  it('selects a whole column from its header title', async () => {
    const { wrapper: w } = mountGrid();
    await w.get('th span').trigger('pointerdown', { button: 0 });
    expect(
      w
        .findAll('[data-col-id="topic"]')
        .map((c) => c.attributes('aria-selected')),
    ).toEqual(['true', 'true', 'true']);
  });
});

describe('DataGrid save errors', () => {
  it('lists backend errors and outlines the clicked one’s cell for 2 s', async () => {
    const onSave = vi.fn(async () => ({
      errors: [{ row: 0, rowId: 'r3', field: 'risk', message: 'Too risky' }],
      saved: 0,
    }));
    const { wrapper: w } = mountGrid(onSave);
    await w.get('[aria-label="Select row"]').trigger('click');
    await button(w, 'Delete').trigger('click');
    await button(w, 'Save').trigger('click');
    await flushPromises();

    const failed = cell(w, 'r3', 'risk');
    expect(failed.attributes('aria-invalid')).toBe('true');
    expect(failed.classes()).toContain('bg-error/10');
    const entry = w
      .findAll('button')
      .find((b) => b.text().includes('Too risky'));
    expect(entry?.text()).toContain('Row 1: risk');

    vi.useFakeTimers();
    try {
      await entry?.trigger('click');
      expect(cell(w, 'r3', 'risk').classes()).toContain('outline-error');
      expect(cell(w, 'r3', 'risk').attributes('aria-selected')).toBe('true');
      await vi.advanceTimersByTimeAsync(2000);
      expect(cell(w, 'r3', 'risk').classes()).not.toContain('outline-error');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a failed request as a network entry', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('offline');
    });
    const { wrapper: w } = mountGrid(onSave);
    await w.get('[aria-label="Select row"]').trigger('click');
    await button(w, 'Delete').trigger('click');
    await button(w, 'Save').trigger('click');
    await flushPromises();

    expect(w.get('[role="alert"]').text()).toBe('NetworkSave failed');
  });
});
