import { describe, it, expect } from 'vite-plus/test';
import { nextTick, shallowRef } from 'vue';
import { useGridSelection } from './useGridSelection';
import type { GridSelection } from './useGridSelection';
import type { GridOrder } from 'utils/gridRange';

const ORDER: GridOrder = {
  rowIds: ['r1', 'r2', 'r3'],
  colIds: ['a', 'b', 'c'],
};

function setup(order: GridOrder = ORDER) {
  const visible = shallowRef(order);
  return { sel: useGridSelection(visible), visible };
}

/** The selected cells as `row:col` strings, row-major. */
function selected(sel: GridSelection): Array<string> {
  return sel
    .cells()
    .flat()
    .map((c) => `${c.rowId}:${c.colId}`);
}

describe('useGridSelection', () => {
  it('moves the active cell with keys and stops at the edges', () => {
    const { sel } = setup();
    sel.select({ rowId: 'r1', colId: 'a' });
    expect(sel.step('down')).toBe(true);
    expect(sel.step('right')).toBe(true);
    expect(sel.active.value).toEqual({ rowId: 'r2', colId: 'b' });
    sel.step('end');
    expect(sel.step('right')).toBe(false);
    expect(sel.active.value).toEqual({ rowId: 'r2', colId: 'c' });
    expect(selected(sel)).toEqual(['r2:c']);
  });

  it('grows a range with Shift moves and collapses it on a plain move from the active cell', () => {
    const { sel } = setup();
    sel.select({ rowId: 'r1', colId: 'a' });
    sel.step('down', true);
    sel.step('right', true);
    expect(selected(sel)).toEqual(['r1:a', 'r1:b', 'r2:a', 'r2:b']);
    expect(sel.isSelected('r2', 'b')).toBe(true);
    expect(sel.isSelected('r3', 'a')).toBe(false);
    expect(sel.isActive('r1', 'a')).toBe(true);

    sel.step('down');
    expect(selected(sel)).toEqual(['r2:a']);
  });

  it('extends to a Shift-clicked or dragged-over cell, keeping the anchor', () => {
    const { sel } = setup();
    sel.press({ rowId: 'r3', colId: 'c' }, { extend: false, target: 'cell' });
    sel.press({ rowId: 'r2', colId: 'b' }, { extend: true, target: 'cell' });
    expect(selected(sel)).toEqual(['r2:b', 'r2:c', 'r3:b', 'r3:c']);
    sel.enter({ rowId: 'r1', colId: 'c' });
    expect(selected(sel)).toEqual(['r1:c', 'r2:c', 'r3:c']);
    expect(sel.active.value).toEqual({ rowId: 'r3', colId: 'c' });
  });

  it('drags only while the button is held after a press on a cell', () => {
    const { sel } = setup();
    sel.select({ rowId: 'r1', colId: 'a' });
    sel.enter({ rowId: 'r2', colId: 'b' });
    expect(selected(sel)).toEqual(['r1:a']);

    // A press on a button inside a cell selects it but starts no drag.
    sel.press(
      { rowId: 'r1', colId: 'b' },
      { extend: false, target: 'control' },
    );
    sel.enter({ rowId: 'r2', colId: 'b' });
    expect(selected(sel)).toEqual(['r1:b']);

    sel.press({ rowId: 'r1', colId: 'a' }, { extend: false, target: 'cell' });
    sel.release();
    sel.enter({ rowId: 'r2', colId: 'b' });
    expect(selected(sel)).toEqual(['r1:a']);
    expect(sel.dragging.value).toBe(false);
  });

  it('never drags while a cell is edited, and a press on the edited cell does nothing', () => {
    const { sel } = setup();
    sel.startEdit({ rowId: 'r1', colId: 'a' }, null);
    sel.press({ rowId: 'r1', colId: 'a' }, { extend: true, target: 'cell' });
    expect(selected(sel)).toEqual(['r1:a']);

    // A press elsewhere selects, but the drag waits for the edit to end.
    sel.press({ rowId: 'r2', colId: 'a' }, { extend: false, target: 'cell' });
    sel.enter({ rowId: 'r3', colId: 'b' });
    expect(selected(sel)).toEqual(['r2:a']);
    expect(sel.dragging.value).toBe(false);

    sel.stopEdit();
    sel.enter({ rowId: 'r3', colId: 'b' });
    expect(selected(sel)).toEqual(['r2:a', 'r2:b', 'r3:a', 'r3:b']);
  });

  it('a fill-handle drag is returned once on release and grows the range over its rows', () => {
    const { sel } = setup();
    sel.select({ rowId: 'r1', colId: 'a' });
    sel.select({ rowId: 'r1', colId: 'b' }, true);
    sel.press(
      { rowId: 'r1', colId: 'b' },
      { extend: false, target: 'fillHandle' },
    );
    sel.enter({ rowId: 'r3', colId: 'c' });
    expect(sel.isFillTarget('r3', 'b')).toBe(true);
    expect(sel.isFillTarget('r3', 'c')).toBe(false);

    expect(sel.release()).toEqual({
      source: {
        anchor: { rowId: 'r1', colId: 'a' },
        focus: { rowId: 'r1', colId: 'b' },
      },
      toRowId: 'r3',
    });
    expect(selected(sel)).toEqual([
      'r1:a',
      'r1:b',
      'r2:a',
      'r2:b',
      'r3:a',
      'r3:b',
    ]);
    expect(sel.release()).toBeNull();
  });

  it('cancels a running fill when its source column is hidden, writing nothing', async () => {
    const { sel, visible } = setup();
    sel.select({ rowId: 'r1', colId: 'b' });
    sel.press(
      { rowId: 'r1', colId: 'b' },
      { extend: false, target: 'fillHandle' },
    );
    sel.enter({ rowId: 'r3', colId: 'b' });
    visible.value = { rowIds: ORDER.rowIds, colIds: ['a', 'c'] };
    await nextTick();
    expect(sel.isFillTarget('r3', 'c')).toBe(false);

    sel.enter({ rowId: 'r2', colId: 'c' });
    expect(sel.release()).toBeNull();
    expect(selected(sel)).toEqual(['r1:c']);
  });

  it('selects a whole row or a whole column of the visible grid', () => {
    const { sel } = setup();
    sel.selectRow('r2');
    expect(selected(sel)).toEqual(['r2:a', 'r2:b', 'r2:c']);
    sel.selectColumn('b');
    expect(selected(sel)).toEqual(['r1:b', 'r2:b', 'r3:b']);
  });

  it('ignores keys until a cell is active', () => {
    const { sel } = setup();
    expect(sel.step('down')).toBe(false);
    expect(sel.active.value).toBeNull();
  });

  it('tracks one editing cell, which becomes the active cell', () => {
    const { sel } = setup();
    sel.select({ rowId: 'r1', colId: 'a' });
    sel.startEdit({ rowId: 'r2', colId: 'b' }, 'x');
    expect(sel.state.value.editing).toEqual({
      pos: { rowId: 'r2', colId: 'b' },
      seed: 'x',
    });
    expect(sel.isEditing('r2', 'b')).toBe(true);
    expect(sel.isEditing('r1', 'a')).toBe(false);
    expect(sel.active.value).toEqual({ rowId: 'r2', colId: 'b' });
    sel.stopEdit();
    expect(sel.state.value.editing).toBeNull();
  });

  it('moves over the filtered view only and refits when rows vanish', async () => {
    const { sel, visible } = setup();
    sel.select({ rowId: 'r2', colId: 'a' });
    sel.startEdit({ rowId: 'r2', colId: 'a' }, null);
    visible.value = { rowIds: ['r1', 'r3'], colIds: ORDER.colIds };
    await nextTick();
    // The row that slid into r2's place is now active; the edit on r2 ended.
    expect(sel.active.value).toEqual({ rowId: 'r3', colId: 'a' });
    expect(sel.state.value.editing).toBeNull();
    sel.step('up');
    expect(sel.active.value).toEqual({ rowId: 'r1', colId: 'a' });
  });

  it('keeps its state object when nothing changes, so cells do not re-render', () => {
    const { sel } = setup();
    sel.press({ rowId: 'r1', colId: 'a' }, { extend: false, target: 'cell' });
    const before = sel.state.value;
    sel.step('up');
    sel.step('left', true);
    sel.enter({ rowId: 'r1', colId: 'a' });
    sel.stopEdit();
    expect(sel.state.value).toBe(before);
  });
});
