import { describe, it, expect } from 'vite-plus/test';
import {
  cellsIn,
  colRange,
  extend,
  move,
  reconcile,
  rowRange,
} from './gridRange';
import type { CellPos, GridOrder } from './gridRange';

const at = (rowId: string, colId: string): CellPos => ({ rowId, colId });

const order: GridOrder = {
  rowIds: ['r1', 'r2', 'r3', 'r4'],
  colIds: ['a', 'b', 'c'],
};

describe('move', () => {
  it('steps one cell in each direction', () => {
    expect(move(at('r2', 'b'), 'up', order)).toEqual(at('r1', 'b'));
    expect(move(at('r2', 'b'), 'down', order)).toEqual(at('r3', 'b'));
    expect(move(at('r2', 'b'), 'left', order)).toEqual(at('r2', 'a'));
    expect(move(at('r2', 'b'), 'right', order)).toEqual(at('r2', 'c'));
  });

  it('clamps at every edge, so Tab at the row end stays put', () => {
    const topLeft = at('r1', 'a');
    const bottomRight = at('r4', 'c');
    expect(move(topLeft, 'up', order)).toEqual(topLeft);
    expect(move(topLeft, 'left', order)).toEqual(topLeft);
    expect(move(bottomRight, 'down', order)).toEqual(bottomRight);
    expect(move(bottomRight, 'right', order)).toEqual(bottomRight);
    expect(move(at('r2', 'c'), 'right', order)).toEqual(at('r2', 'c'));
  });

  it('jumps to the row ends with home/end and the column ends with top/bottom', () => {
    expect(move(at('r2', 'b'), 'home', order)).toEqual(at('r2', 'a'));
    expect(move(at('r2', 'b'), 'end', order)).toEqual(at('r2', 'c'));
    expect(move(at('r2', 'b'), 'top', order)).toEqual(at('r1', 'b'));
    expect(move(at('r2', 'b'), 'bottom', order)).toEqual(at('r4', 'b'));
  });

  it('jumps to the first and last cell of the grid with first/last', () => {
    expect(move(at('r2', 'b'), 'first', order)).toEqual(at('r1', 'a'));
    expect(move(at('r2', 'b'), 'last', order)).toEqual(at('r4', 'c'));
  });

  it('follows the visible order, skipping rows a filter hides', () => {
    const filtered = { ...order, rowIds: ['r1', 'r3', 'r4'] };
    expect(move(at('r1', 'a'), 'down', filtered)).toEqual(at('r3', 'a'));
    const sorted = { ...order, rowIds: ['r4', 'r3', 'r2', 'r1'] };
    expect(move(at('r1', 'a'), 'up', sorted)).toEqual(at('r2', 'a'));
  });
});

describe('extend', () => {
  it('moves the focus and keeps the anchor', () => {
    const range = { anchor: at('r1', 'a'), focus: at('r1', 'a') };
    const grown = extend(extend(range, 'down', order), 'right', order);
    expect(grown).toEqual({ anchor: at('r1', 'a'), focus: at('r2', 'b') });
  });

  it('skips rows hidden by a filter', () => {
    const filtered = { ...order, rowIds: ['r1', 'r3', 'r4'] };
    const range = { anchor: at('r1', 'a'), focus: at('r1', 'a') };
    const grown = extend(range, 'down', filtered);
    expect(grown.focus).toEqual(at('r3', 'a'));
    expect(cellsIn(grown, filtered)).toEqual([
      [at('r1', 'a')],
      [at('r3', 'a')],
    ]);
  });

  it('grows to the last cell of the grid, so the range covers every row', () => {
    const range = { anchor: at('r1', 'a'), focus: at('r1', 'a') };
    const all = extend(range, 'last', order);
    expect(all).toEqual({ anchor: at('r1', 'a'), focus: at('r4', 'c') });
    expect(cellsIn(all, order)).toHaveLength(4);
  });
});

describe('cellsIn', () => {
  it('returns the block row-major, top-left first, whichever corner is the anchor', () => {
    const block = [
      [at('r2', 'b'), at('r2', 'c')],
      [at('r3', 'b'), at('r3', 'c')],
    ];
    expect(
      cellsIn({ anchor: at('r2', 'b'), focus: at('r3', 'c') }, order),
    ).toEqual(block);
    expect(
      cellsIn({ anchor: at('r3', 'c'), focus: at('r2', 'b') }, order),
    ).toEqual(block);
  });

  it('is empty when an end of the range is not visible', () => {
    const filtered = { ...order, rowIds: ['r1', 'r2'] };
    expect(
      cellsIn({ anchor: at('r1', 'a'), focus: at('r3', 'a') }, filtered),
    ).toEqual([]);
  });
});

describe('rowRange / colRange', () => {
  it('spans the whole visible row or column', () => {
    expect(cellsIn(rowRange('r2', order), order)).toEqual([
      [at('r2', 'a'), at('r2', 'b'), at('r2', 'c')],
    ]);
    expect(cellsIn(colRange('b', order), order)).toEqual([
      [at('r1', 'b')],
      [at('r2', 'b')],
      [at('r3', 'b')],
      [at('r4', 'b')],
    ]);
  });

  it('is null when the grid has nothing to span', () => {
    expect(rowRange('r1', { rowIds: ['r1'], colIds: [] })).toBeNull();
    expect(colRange('a', { rowIds: [], colIds: ['a'] })).toBeNull();
  });
});

describe('reconcile', () => {
  const range = { anchor: at('r2', 'a'), focus: at('r3', 'b') };

  it('keeps the range when every end is still visible, even after a sort', () => {
    const sorted = { ...order, rowIds: ['r4', 'r3', 'r2', 'r1'] };
    expect(reconcile(range, order, sorted)).toBe(range);
  });

  it('collapses to the row that slid into place when the anchor is filtered out', () => {
    const filtered = { ...order, rowIds: ['r1', 'r3', 'r4'] };
    expect(reconcile(range, order, filtered)).toEqual({
      anchor: at('r3', 'a'),
      focus: at('r3', 'a'),
    });
  });

  it('falls back to the row above when the last rows are deleted', () => {
    const last = { anchor: at('r4', 'c'), focus: at('r4', 'c') };
    const deleted = { ...order, rowIds: ['r1', 'r2'] };
    expect(reconcile(last, order, deleted)).toEqual({
      anchor: at('r2', 'c'),
      focus: at('r2', 'c'),
    });
  });

  it('moves only the focus when just the focus row is deleted', () => {
    const deleted = { ...order, rowIds: ['r1', 'r2', 'r4'] };
    expect(reconcile(range, order, deleted)).toEqual({
      anchor: at('r2', 'a'),
      focus: at('r4', 'b'),
    });
  });

  it('is null when no row is left', () => {
    expect(reconcile(range, order, { ...order, rowIds: [] })).toBeNull();
  });
});
