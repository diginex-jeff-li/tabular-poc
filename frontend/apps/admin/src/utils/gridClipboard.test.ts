import { describe, it, expect } from 'vite-plus/test';
import { parsePositionalPaste, serializeTsv } from './gridClipboard';
import type { CellPos } from './gridRange';
import type { GridColumn } from './zodToColumnDefs';

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

const at = (rowId: string, colId: string): CellPos => ({ rowId, colId });

describe('serializeTsv', () => {
  const columns = [readOnly('status'), text('name'), text('note')];

  it('joins cells with tabs and rows with newlines, no header', () => {
    const rows = [
      { id: 'r1', name: 'Alice', note: 'one' },
      { id: 'r2', name: 'Bob', note: null },
    ];
    const cells = [
      [at('r1', 'name'), at('r1', 'note')],
      [at('r2', 'name'), at('r2', 'note')],
    ];
    expect(serializeTsv(rows, cells, columns)).toBe('Alice\tone\nBob\t');
  });

  it('leaves out columns that are not pasted (Status, checkbox)', () => {
    const rows = [{ id: 'r1', status: 'Ready', name: 'Alice' }];
    const cells = [
      [at('r1', 'status'), at('r1', '__select'), at('r1', 'name')],
    ];
    expect(serializeTsv(rows, cells, columns)).toBe('Alice');
    expect(serializeTsv(rows, [[at('r1', 'status')]], columns)).toBe('');
  });

  it('quotes values holding a tab, line break or quote, doubling the quotes', () => {
    const rows = [{ id: 'r1', name: 'a\tb', note: 'say "hi"\nbye' }];
    const cells = [[at('r1', 'name'), at('r1', 'note')]];
    expect(serializeTsv(rows, cells, columns)).toBe(
      '"a\tb"\t"say ""hi""\nbye"',
    );
  });

  it('pastes back into the same columns', () => {
    const rows = [
      { id: 'r1', name: 'Alice', note: 'one' },
      { id: 'r2', name: 'Bob', note: 'two' },
    ];
    const cells = [
      [at('r1', 'status'), at('r1', 'name'), at('r1', 'note')],
      [at('r2', 'status'), at('r2', 'name'), at('r2', 'note')],
    ];
    expect(
      parsePositionalPaste(serializeTsv(rows, cells, columns), columns),
    ).toEqual([
      { name: 'Alice', note: 'one' },
      { name: 'Bob', note: 'two' },
    ]);
  });
});

// Ported by behaviour from `parseClipboardPaste` in useGridEditor.test.ts.
// Its `visible: false` case has no counterpart: hidden fields never become a
// `GridColumn`.
describe('parsePositionalPaste', () => {
  it('maps cells positionally to pasted columns, skipping columns that are not pasted', () => {
    const columns = [readOnly('__select'), text('name'), text('age')];
    expect(parsePositionalPaste('Alice\t30', columns)).toStrictEqual([
      { name: 'Alice', age: '30' },
    ]);
  });

  it('filters by the paste flag, not by position: a read-only column mid-grid does not shift cells', () => {
    const columns = [text('name'), readOnly('status'), text('age')];
    expect(parsePositionalPaste('Bob\t25', columns)).toStrictEqual([
      { name: 'Bob', age: '25' },
    ]);
  });

  it('drops extra pasted cells beyond the pasted columns', () => {
    const columns = [readOnly('__select'), text('a'), text('b')];
    expect(parsePositionalPaste('x\ty\tz\tw', columns)).toStrictEqual([
      { a: 'x', b: 'y' },
    ]);
  });

  it('leaves missing trailing columns out', () => {
    const columns = [text('a'), text('b'), text('c')];
    expect(parsePositionalPaste('only-a', columns)).toStrictEqual([
      { a: 'only-a' },
    ]);
  });

  it('parses one row per line', () => {
    const columns = [readOnly('__select'), text('name')];
    expect(parsePositionalPaste('Alice\nBob\nCharlie', columns)).toEqual([
      { name: 'Alice' },
      { name: 'Bob' },
      { name: 'Charlie' },
    ]);
  });

  it('skips blank and whitespace-only lines', () => {
    const columns = [text('name')];
    expect(parsePositionalPaste('Alice\n   \n\nBob', columns)).toEqual([
      { name: 'Alice' },
      { name: 'Bob' },
    ]);
  });

  it('returns no rows for empty or whitespace-only text', () => {
    const columns = [text('name')];
    expect(parsePositionalPaste('', columns)).toEqual([]);
    expect(parsePositionalPaste('   \n  \n', columns)).toEqual([]);
  });
});
