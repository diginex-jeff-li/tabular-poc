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
    validate: () => null,
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

function mountGrid(onSave = vi.fn(async () => ({ errors: [], saved: 0 }))) {
  wrapper = mount(DataGrid, {
    attachTo: document.body,
    props: {
      columns: COLUMNS,
      data: DATA,
      onSave,
      title: 'Grid',
      exportFilename: 'grid.csv',
    },
  });
  return { wrapper, onSave };
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
