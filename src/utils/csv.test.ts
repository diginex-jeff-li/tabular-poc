import { describe, it, expect } from 'vite-plus/test';
import { buildCsv } from './csv';
import type { GridColumn, Row } from './gridApi';

const text = (id: string, title: string): GridColumn => ({
  id,
  title,
  editor: 'text',
  validate: () => null,
  paste: true,
  export: true,
});

const readOnly = (id: string, title: string): GridColumn => ({
  id,
  title,
  editor: null,
  validate: () => null,
  paste: false,
  export: false,
});

/** A small RFC 4180 reader, independent of `buildCsv`, for round-trip checks. */
function parseCsv(csv: string): Array<Array<string>> {
  const records: Array<Array<string>> = [[]];
  let field = '';
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (quoted) {
      if (ch === '"' && csv[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      records.at(-1).push(field);
      field = '';
    } else if (ch === '\r' && csv[i + 1] === '\n') {
      records.at(-1).push(field);
      records.push([]);
      field = '';
      i++;
    } else {
      field += ch;
    }
  }
  records.at(-1).push(field);
  return records;
}

describe('buildCsv', () => {
  const columns = [
    readOnly('status', 'Status'),
    readOnly('__select', ''),
    text('name', 'Full Name'),
    text('note', 'Note'),
  ];

  it('round-trips a value with a comma, a quote and a line break', () => {
    const tricky = 'Smith, "Jo"\nJr';
    const csv = buildCsv([{ id: 'r1', name: tricky, note: 'plain' }], columns);
    expect(parseCsv(csv)).toEqual([
      ['Full Name', 'Note'],
      [tricky, 'plain'],
    ]);
  });

  it('leaves out Status and the checkbox column, and writes blanks as empty fields', () => {
    const rows: Array<Row> = [
      { id: 'r1', status: 'Ready', __select: true, name: 'Ann', note: null },
    ];
    expect(buildCsv(rows, columns)).toBe('Full Name,Note\r\nAnn,');
  });

  it('writes every row it is given in order, including rows a filter hides on screen', () => {
    // The grid passes its rows, not the filtered view; a filter on "Ann" would
    // hide Bo and Cy.
    const rows = [
      { id: 'r1', name: 'Ann', note: 'x' },
      { id: 'r2', name: 'Bo', note: 'y' },
      { id: 'r3', name: 'Cy', note: 'z' },
    ];
    expect(parseCsv(buildCsv(rows, columns))).toEqual([
      ['Full Name', 'Note'],
      ['Ann', 'x'],
      ['Bo', 'y'],
      ['Cy', 'z'],
    ]);
  });
});
