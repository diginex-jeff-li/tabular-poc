import { describe, expect, it } from 'vite-plus/test';
import { fillRange } from './gridFill';
import type { WritableColumn } from './gridWrite';

const columns: Array<WritableColumn> = [
  { id: 'status', editor: null },
  { id: 'topic', editor: 'text' },
  { id: 'risk', editor: 'choice' },
];
const rows = Array.from({ length: 8 }, (_, i) => ({
  id: `r${i + 1}`,
  status: `S${i + 1}`,
  topic: `T${i + 1}`,
  risk: 'Low',
}));
const order = {
  rowIds: rows.map((r) => r.id),
  colIds: ['status', 'topic', 'risk'],
};
const cell = (rowId: string, colId: string) => ({ rowId, colId });

describe('fillRange', () => {
  it('copies one cell down over 3 rows', () => {
    const change = fillRange(
      rows,
      order,
      { anchor: cell('r1', 'topic'), focus: cell('r1', 'topic') },
      'r4',
      columns,
    );
    expect(change.rows.map((r) => r.topic)).toEqual([
      'T1',
      'T1',
      'T1',
      'T1',
      'T5',
      'T6',
      'T7',
      'T8',
    ]);
    expect(change.touchedIds).toEqual(['r2', 'r3', 'r4']);
  });

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

  it('follows the visible order and writes only visible columns', () => {
    const change = fillRange(
      rows,
      { rowIds: ['r8', 'r2', 'r5'], colIds: ['topic'] },
      { anchor: cell('r8', 'topic'), focus: cell('r8', 'topic') },
      'r5',
      columns,
    );
    expect(change.touchedIds).toEqual(['r2', 'r5']);
    expect(change.rows[1]).toEqual({ ...rows[1], topic: 'T8' });
    expect(change.rows[4]).toEqual({ ...rows[4], topic: 'T8' });
  });

  it('writes nothing when released inside the source', () => {
    const source = { anchor: cell('r1', 'topic'), focus: cell('r3', 'risk') };
    const change = fillRange(rows, order, source, 'r2', columns);
    expect(change.rows).toBe(rows);
  });
});
