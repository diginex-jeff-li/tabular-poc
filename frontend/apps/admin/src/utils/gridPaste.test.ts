import { describe, expect, it } from 'vite-plus/test';
import { overwritePaste } from './gridPaste';
import type { WritableColumn } from './gridWrite';

const columns: Array<WritableColumn> = [
  { id: 'status', editor: null },
  { id: 'email', editor: 'text' },
  { id: 'first', editor: 'text' },
  { id: 'role', editor: 'choice' },
];
const rows = [
  { id: 'r1', status: 'Ready', email: 'a@x', first: 'Ann', role: 'Viewer' },
  { id: 'r2', status: 'Ready', email: 'b@x', first: 'Bo', role: 'Viewer' },
  { id: 'r3', status: 'Ready', email: 'c@x', first: 'Cy', role: 'Owner' },
];
const order = {
  rowIds: ['r1', 'r2', 'r3'],
  colIds: ['status', 'email', 'first', 'role'],
};

describe('overwritePaste', () => {
  it('writes a 2×2 block starting at Status into the next editable columns, leaving Status alone', () => {
    const change = overwritePaste(
      rows,
      order,
      { rowId: 'r2', colId: 'status' },
      'z@x\tZed\r\ny@x\tYa\r\n',
      columns,
    );
    expect(change.rows).toEqual([
      rows[0],
      { ...rows[1], email: 'z@x', first: 'Zed' },
      { ...rows[2], email: 'y@x', first: 'Ya' },
    ]);
    expect(change.rows[0]).toBe(rows[0]);
    expect(change.touchedIds).toEqual(['r2', 'r3']);
  });

  it('turns lines past the last visible row into new rows at the bottom', () => {
    const change = overwritePaste(
      rows,
      order,
      { rowId: 'r3', colId: 'first' },
      'One\tAdmin\nTwo\tViewer\nThree\tOwner',
      columns,
    );
    expect(change.rows).toHaveLength(5);
    expect(change.rows[2]).toEqual({ ...rows[2], first: 'One', role: 'Admin' });
    const added = change.rows.slice(3);
    expect(added.map(({ id: _, ...rest }) => rest)).toEqual([
      { first: 'Two', role: 'Viewer' },
      { first: 'Three', role: 'Owner' },
    ]);
    expect(new Set(added.map((r) => r.id)).size).toBe(2);
    expect(change.touchedIds).toEqual(['r3', ...added.map((r) => r.id)]);
  });

  it('drops cells past the last editable column and follows the visible (sorted, reordered, hidden) order', () => {
    const change = overwritePaste(
      rows,
      { rowIds: ['r3', 'r1'], colIds: ['role', 'first'] },
      { rowId: 'r3', colId: 'role' },
      'Admin\tCyd\textra\nOwner\tAnna',
      columns,
    );
    expect(change.rows).toEqual([
      { ...rows[0], role: 'Owner', first: 'Anna' },
      rows[1],
      { ...rows[2], role: 'Admin', first: 'Cyd' },
    ]);
    // `email` is hidden: never written.
    expect(change.rows.map((r) => r.email)).toEqual(['a@x', 'b@x', 'c@x']);
  });

  it('returns the same rows when every pasted value is already there, and makes no row of a blank overflow line', () => {
    const change = overwritePaste(
      rows,
      order,
      { rowId: 'r3', colId: 'email' },
      'c@x\n\t\n',
      columns,
    );
    expect(change.rows).toBe(rows);
    expect(change.touchedIds).toEqual([]);
  });

  it('writes a blank middle line as blank cells', () => {
    const change = overwritePaste(
      rows,
      order,
      { rowId: 'r1', colId: 'first' },
      'Al\n\nCe',
      columns,
    );
    expect(change.rows.map((r) => r.first)).toEqual(['Al', '', 'Ce']);
  });
});
