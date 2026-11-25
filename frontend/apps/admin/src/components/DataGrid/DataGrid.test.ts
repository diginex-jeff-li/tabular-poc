import { flushPromises, mount } from '@vue/test-utils';
import { ROW_HEIGHT } from 'composables/useDataGrid';
import { afterEach, describe, it, expect, vi } from 'vite-plus/test';
import { nextTick } from 'vue';
import DataGrid from './DataGrid';
import { useGridLayout } from './testLayout';
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
useGridLayout();

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

/** Mounts the grid and waits for the virtualizer's first rows. */
async function mountGrid(
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
  await nextTick();
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
    const { wrapper: w } = await mountGrid();
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
    const { wrapper: w } = await mountGrid();
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
    const { wrapper: w } = await mountGrid();
    await w.get('input[aria-label="Filter Topic"]').setValue('LAB');
    expect(visibleTopics(w)).toEqual(['Child labor']);
  });

  it('deletes ticked rows, counts the changes and saves them as deletes', async () => {
    const { wrapper: w, onSave } = await mountGrid();
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
    const { wrapper: w } = await mountGrid();
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
    const { wrapper: w } = await mountGrid(undefined, { onUserEdit });
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
    const { wrapper: w } = await mountGrid(undefined, {
      onUserEdit,
      normalizeRow,
    });
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
    const { wrapper: w, onSave } = await mountGrid();
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
    const { wrapper: w } = await mountGrid();
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
    const { wrapper: w } = await mountGrid(undefined, { onUserEdit });
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
    const { wrapper: w } = await mountGrid();
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
    const { wrapper: w } = await mountGrid();
    await cell(w, 'r1', 'topic').trigger('pointerdown', { button: 0 });
    const filter = w.get('input[aria-label="Filter Topic"]');
    await filter.trigger('keydown', { key: 'ArrowDown' });
    await filter.trigger('keydown', { key: 'x' });

    expect(cell(w, 'r1', 'topic').attributes('aria-selected')).toBe('true');
    expect(cell(w, 'r2', 'topic').attributes('aria-selected')).toBe('false');
    expect(w.find('[data-grid-editor]').exists()).toBe(false);
  });

  it('a drag that starts in a header filter never changes the range', async () => {
    const { wrapper: w } = await mountGrid();
    await cell(w, 'r1', 'topic').trigger('pointerdown', { button: 0 });
    window.dispatchEvent(new PointerEvent('pointerup'));
    const filter = w.get('input[aria-label="Filter Topic"]');
    await filter.trigger('pointerdown', { button: 0 });
    await filter.trigger('mousedown', { button: 0 });
    await cell(w, 'r2', 'risk').trigger('pointerenter');

    expect(cell(w, 'r1', 'topic').attributes('aria-selected')).toBe('true');
    expect(cell(w, 'r2', 'risk').attributes('aria-selected')).toBe('false');
  });

  it('selects a whole column from its header title', async () => {
    const { wrapper: w } = await mountGrid();
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
    const { wrapper: w } = await mountGrid(onSave);
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
    // r1 was deleted, so r3 is the 2nd row on screen; the request says row 0.
    expect(entry?.text()).toContain('Row 2: risk');

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
    const { wrapper: w } = await mountGrid(onSave);
    await w.get('[aria-label="Select row"]').trigger('click');
    await button(w, 'Delete').trigger('click');
    await button(w, 'Save').trigger('click');
    await flushPromises();

    expect(w.get('[role="alert"]').text()).toBe('NetworkSave failed');
  });
});

/**
 * Pastes `text` on `target` and lets the grid re-render. A real paste
 * carries its text on `clipboardData`; happy-dom's ClipboardEvent does not.
 */
async function paste(target: Element, text: string): Promise<Event> {
  // The grid's root listeners attach after the first render's post flush.
  await flushPromises();
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/plain' ? text : '') },
  });
  target.dispatchEvent(event);
  await flushPromises();
  return event;
}

/** Body row ids, top to bottom. */
function rowIds(w: VueWrapper): Array<string> {
  return w
    .findAll('[data-col-id="topic"]')
    .map((c) => c.attributes('data-row-id') ?? '');
}

describe('DataGrid paste', () => {
  it('appends pasted lines as new rows, positionally, through normalizeRow', async () => {
    const onUserEdit = vi.fn();
    const normalizeRow = vi.fn((row: Record<string, unknown>) => ({
      ...row,
      topic: String(row.topic).trim(),
    }));
    const { wrapper: w } = await mountGrid(undefined, {
      onUserEdit,
      normalizeRow,
    });

    const event = await paste(
      root(w).element,
      ' Fire safety \tHigh\nNoise\tLow\textra\n',
    );

    expect(event.defaultPrevented).toBe(true);
    expect(visibleTopics(w)).toEqual([
      'Child labor',
      'Wages',
      'Air quality',
      'Fire safety',
      'Noise',
    ]);
    expect(cell(w, rowIds(w)[4], 'risk').text()).toBe('Low');
    const added = rowIds(w).slice(3);
    expect(new Set([...added, 'r1', 'r2', 'r3']).size).toBe(5);
    expect(onUserEdit).toHaveBeenCalledTimes(1);
    expect(onUserEdit).toHaveBeenCalledWith(added);
    expect(w.get('[role="status"]').text()).toContain('2 changes');
  });

  it('inserts what the page’s pasteParser returns instead', async () => {
    const onUserEdit = vi.fn();
    const pasteParser = vi.fn(
      (text: string, positional: () => Array<Record<string, unknown>>) =>
        text.startsWith('Topic\t')
          ? []
          : positional().map((row) => ({ ...row, risk: 'Medium' })),
    );
    const { wrapper: w } = await mountGrid(undefined, {
      onUserEdit,
      pasteParser,
    });

    await paste(root(w).element, 'Topic\tRisk\nNoise\tLow');
    expect(pasteParser).toHaveBeenCalledWith(
      'Topic\tRisk\nNoise\tLow',
      expect.any(Function),
    );
    expect(visibleTopics(w)).toHaveLength(3);
    expect(onUserEdit).toHaveBeenLastCalledWith([]);

    await paste(root(w).element, 'Noise\tLow');
    const [added] = rowIds(w).slice(3);
    expect(cell(w, added, 'topic').text()).toBe('Noise');
    expect(cell(w, added, 'risk').text()).toBe('Medium');
    expect(onUserEdit).toHaveBeenLastCalledWith([added]);
  });

  it('leaves a paste into a header filter to the filter', async () => {
    const onUserEdit = vi.fn();
    const { wrapper: w } = await mountGrid(undefined, { onUserEdit });
    const event = await paste(
      w.get('input[aria-label="Filter Topic"]').element,
      'Noise\tLow',
    );
    expect(event.defaultPrevented).toBe(false);
    expect(visibleTopics(w)).toHaveLength(3);
    expect(onUserEdit).not.toHaveBeenCalled();
  });

  it('focuses the grid from the empty-state overlay, so a paste lands in it', async () => {
    const { wrapper: w } = await mountGrid(undefined, { data: [] });
    const overlay = w.get('[data-testid="grid-empty"]');
    expect(overlay.text()).toContain('Paste your Excel data here');

    await overlay.trigger('click');
    expect(document.activeElement).toBe(root(w).element);

    await paste(root(w).element, 'Noise\tLow\nWages\tHigh');
    expect(visibleTopics(w)).toEqual(['Noise', 'Wages']);
    expect(w.find('[data-testid="grid-empty"]').exists()).toBe(false);
  });
});

const STATUS: GridColumn = {
  id: 'status',
  title: 'Status',
  editor: null,
  filter: null,
  paste: false,
  export: false,
  validate: () => null,
};

describe('DataGrid range clear', () => {
  it('Backspace empties only the editable cells of the range and reports the rows once', async () => {
    const onUserEdit = vi.fn();
    const { wrapper: w } = await mountGrid(undefined, {
      onUserEdit,
      columns: [STATUS, ...COLUMNS],
      data: DATA.map((row) => ({ ...row, status: 'Ready' })),
    });
    await w.findAll('[aria-label="Select row"]')[0].trigger('click');
    // A press beside a row's checkbox selects its cells, Status included.
    w.findAll(
      '[aria-label="Select row"]',
    )[0].element.parentElement?.dispatchEvent(
      new PointerEvent('pointerdown', { button: 0, bubbles: true }),
    );
    await root(w).trigger('keydown', { key: 'ArrowDown', shiftKey: true });

    const key = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    });
    root(w).element.dispatchEvent(key);
    await flushPromises();

    expect(key.defaultPrevented).toBe(true);
    for (const rowId of ['r1', 'r2']) {
      expect(cell(w, rowId, 'status').text()).toBe('Ready');
      expect(cell(w, rowId, 'topic').text()).toBe('');
      expect(cell(w, rowId, 'risk').text()).toBe('');
      expect(cell(w, rowId, 'topic').attributes('aria-invalid')).toBe('true');
    }
    expect(cell(w, 'r3', 'topic').text()).toBe('Air quality');
    expect(
      w.findAll('[aria-label="Select row"]')[0].attributes('aria-checked'),
    ).toBe('true');
    expect(onUserEdit).toHaveBeenCalledTimes(1);
    expect(onUserEdit).toHaveBeenCalledWith(['r1', 'r2']);

    await root(w).trigger('keydown', { key: 'Delete' });
    expect(onUserEdit).toHaveBeenCalledTimes(1);
  });
});

describe('DataGrid CSV export', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads every row, filtered-out ones included, without read-only columns', async () => {
    // happy-dom's Blob is foreign to Node's URL.createObjectURL: stub it.
    const blobs: Array<Blob> = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return 'blob:csv';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clicked: Array<HTMLAnchorElement> = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });
    const { wrapper: w } = await mountGrid(undefined, {
      columns: [STATUS, ...COLUMNS],
      data: DATA.map((row) => ({ ...row, status: 'Ready' })),
    });
    await w.get('input[aria-label="Filter Topic"]').setValue('w');
    expect(visibleTopics(w)).toEqual(['Wages']);

    await button(w, 'Export')?.trigger('click');
    await flushPromises();

    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('grid.csv');
    expect(clicked[0].href).toBe('blob:csv');
    expect(await blobs[0].text()).toBe(
      'Topic,Risk\r\nChild labor,Low\r\nWages,High\r\nAir quality,High',
    );
  });
});

describe('DataGrid virtualization', () => {
  // Three screens of rows; the stubbed viewport shows 20.
  const MANY = Array.from({ length: 60 }, (_, i) => ({
    id: `r${i + 1}`,
    topic: `Topic ${i + 1}`,
    risk: 'Low',
  }));

  /** Scrolls the grid, as a wheel or the scrollbar does, and lets it re-render. */
  async function scrollTo(w: VueWrapper, top: number) {
    const el = root(w).element;
    el.scrollTop = top;
    el.dispatchEvent(new Event('scroll'));
    await flushPromises();
  }

  /** Fires a copy on the grid and returns the text it put on the clipboard. */
  async function copy(w: VueWrapper): Promise<string> {
    await flushPromises();
    let text = '';
    const event = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { setData: (_type: string, value: string) => (text = value) },
    });
    root(w).element.dispatchEvent(event);
    return text;
  }

  it('commits an open edit when its row scrolls out of view', async () => {
    const onUserEdit = vi.fn();
    const { wrapper: w } = await mountGrid(undefined, {
      data: MANY,
      onUserEdit,
    });
    const input = await editCell(w, 'r1', 'topic');
    await input.setValue('Scrolled away');

    await scrollTo(w, 40 * ROW_HEIGHT);
    expect(w.find('[data-row-id="r1"]').exists()).toBe(false);
    expect(onUserEdit).toHaveBeenCalledExactlyOnceWith(['r1']);
    // Keys keep working: focus went back to the grid, not to the page.
    expect(document.activeElement).toBe(root(w).element);

    await scrollTo(w, 0);
    expect(cell(w, 'r1', 'topic').text()).toBe('Scrolled away');
    expect(w.find('[data-grid-editor]').exists()).toBe(false);
  });

  it('Ctrl+Shift+End selects to the last cell, shows it, and copies every row', async () => {
    const { wrapper: w } = await mountGrid(undefined, { data: MANY });
    expect(w.find('[data-row-id="r60"]').exists()).toBe(false);
    await cell(w, 'r1', 'topic').trigger('pointerdown', { button: 0 });
    await root(w).trigger('keydown', {
      key: 'End',
      ctrlKey: true,
      shiftKey: true,
    });
    await scrollTo(w, root(w).element.scrollTop);

    expect(cell(w, 'r60', 'risk').attributes('aria-selected')).toBe('true');
    const lines = (await copy(w)).split('\n');
    expect(lines).toHaveLength(60);
    expect(lines[0]).toBe('Topic 1\tLow');
    expect(lines[59]).toBe('Topic 60\tLow');
  });
});
