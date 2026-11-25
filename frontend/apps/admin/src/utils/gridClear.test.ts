import { describe, it, expect } from 'vite-plus/test';
import { clearCells } from './gridClear';
import { cellsIn } from './gridRange';
import type { GridColumn } from './zodToColumnDefs';
import type { Row } from 'composables/useDataGrid';

const text = (id: string): GridColumn => ({
  id,
  title: id,
  editor: 'text',
  filter: 'text',
  validate: () => null,
  paste: true,
  export: true,
});

const readOnly = (id: string): GridColumn => ({
  id,
  title: id,
  editor: null,
  filter: null,
  validate: () => null,
  paste: false,
  export: false,
});

const columns = [
  readOnly('status'),
  readOnly('__select'),
  text('email'),
  text('firstName'),
  text('lastName'),
];
const order = {
  rowIds: ['r1', 'r2', 'r3'],
  colIds: ['status', '__select', 'email', 'firstName', 'lastName'],
};
const block = cellsIn(
  {
    anchor: { rowId: 'r1', colId: 'status' },
    focus: { rowId: 'r2', colId: 'firstName' },
  },
  order,
);

describe('clearCells', () => {
  it('clears only the editable cells of a range spanning Status, checkbox, email and firstName over 2 rows', () => {
    const rows = [
      { id: 'r1', email: 'a@x.com', firstName: 'Ann', lastName: 'Lee' },
      { id: 'r2', email: 'b@x.com', firstName: 'Bo', lastName: 'Ng' },
      { id: 'r3', email: 'c@x.com', firstName: 'Cy', lastName: 'Oh' },
    ];
    const result = clearCells(rows, block, columns);
    expect(result.rows).toStrictEqual([
      { id: 'r1', email: null, firstName: null, lastName: 'Lee' },
      { id: 'r2', email: null, firstName: null, lastName: 'Ng' },
      { id: 'r3', email: 'c@x.com', firstName: 'Cy', lastName: 'Oh' },
    ]);
    expect(result.touchedIds).toEqual(['r1', 'r2']);
    expect(result.rows[2]).toBe(rows[2]);
  });

  it('never writes read-only columns, even when they hold a value', () => {
    const rows = [{ id: 'r1', status: 'Ready', __select: true, email: 'a' }];
    const { rows: next } = clearCells(rows, block, columns);
    expect(next[0]).toStrictEqual({
      id: 'r1',
      status: 'Ready',
      __select: true,
      email: null,
    });
  });

  it('skips blank cells, so a row with nothing to clear is not touched', () => {
    const rows = [
      { id: 'r1', email: '', firstName: null },
      { id: 'r2', email: 'b@x.com', firstName: '' },
    ];
    const result = clearCells(rows, block, columns);
    expect(result.touchedIds).toEqual(['r2']);
    expect(result.rows[0]).toBe(rows[0]);
    expect(result.rows[1]).toStrictEqual({
      id: 'r2',
      email: null,
      firstName: '',
    });
  });

  it('returns the same rows when nothing is cleared', () => {
    const rows: Array<Row> = [{ id: 'r1', email: null }];
    const result = clearCells(rows, block, columns);
    expect(result.rows).toBe(rows);
    expect(result.touchedIds).toEqual([]);
  });
});
