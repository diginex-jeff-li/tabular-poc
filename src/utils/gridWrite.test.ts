import { describe, expect, it } from 'vite-plus/test';
import { fillRange, overwritePaste } from './gridWrite';
import type { WritableColumn } from './gridWrite';

const cell = (rowId: string, colId: string) => ({ rowId, colId });

describe('fillRange', () => {
  const columns: Array<WritableColumn> = [
    { id: 'status', editor: null },
    { id: 'topic', editor: 'text' },
  ];
  const rows = Array.from({ length: 8 }, (_, i) => ({
    id: `r${i + 1}`,
    status: `S${i + 1}`,
    topic: `T${i + 1}`,
  }));
  const order = {
    rowIds: rows.map((r) => r.id),
    colIds: ['status', 'topic'],
  };

  it('repeats a 2-row pattern over 5 rows, and never writes a read-only column', () => {
    const change = fillRange(
      rows,
      order,
      { anchor: cell('r1', 'status'), focus: cell('r2', 'topic') },
      'r7',
      columns,
    );
    expect(change.rows.map((r) => r.topic)).toEqual([
      'T1',
      'T2',
      'T1',
      'T2',
      'T1',
      'T2',
      'T1',
      'T8',
    ]);
    expect(change.rows.map((r) => r.status)).toEqual(rows.map((r) => r.status));
  });

  it('fills upward with the pattern running on unbroken', () => {
    const change = fillRange(
      rows,
      order,
      { anchor: cell('r6', 'topic'), focus: cell('r7', 'topic') },
      'r3',
      columns,
    );
    expect(change.rows.map((r) => r.topic)).toEqual([
      'T1',
      'T2',
      'T7',
      'T6',
      'T7',
      'T6',
      'T7',
      'T8',
    ]);
  });
});

describe('overwritePaste', () => {
  const columns: Array<WritableColumn> = [
    { id: 'email', editor: 'text' },
    { id: 'first', editor: 'text' },
    { id: 'role', editor: 'choice' },
  ];
  const rows = [
    { id: 'r1', email: 'a@x', first: 'Ann', role: 'Viewer' },
    { id: 'r2', email: 'b@x', first: 'Bo', role: 'Viewer' },
    { id: 'r3', email: 'c@x', first: 'Cy', role: 'Owner' },
  ];
  const order = {
    rowIds: ['r1', 'r2', 'r3'],
    colIds: ['email', 'first', 'role'],
  };

  it('drops cells past the last visible editable column and never writes a hidden one', () => {
    const change = overwritePaste(
      rows,
      { rowIds: ['r3', 'r1'], colIds: ['role', 'first'] },
      cell('r3', 'role'),
      'Admin\tCyd\textra\nOwner\tAnna',
      columns,
    );
    expect(change.rows).toEqual([
      { ...rows[0], role: 'Owner', first: 'Anna' },
      rows[1],
      { ...rows[2], role: 'Admin', first: 'Cyd' },
    ]);
  });

  it('makes no row of a blank line past the last visible row', () => {
    const change = overwritePaste(
      rows,
      order,
      cell('r3', 'email'),
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
      cell('r1', 'first'),
      'Al\n\nCe',
      columns,
    );
    expect(change.rows.map((r) => r.first)).toEqual(['Al', '', 'Ce']);
  });
});
