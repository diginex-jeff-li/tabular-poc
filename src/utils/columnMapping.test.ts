import { describe, expect, it } from 'vite-plus/test';
import {
  applyColumnMapping,
  mappingProblems,
  planPaste,
  planTable,
} from './columnMapping';

const tsv = (...lines: Array<Array<string>>) =>
  lines.map((l) => l.join('\t')).join('\n');

// The client export from the user's screenshot: 10 columns, template
// columns out of order, extra HR columns.
const CLIENT_HEADER = [
  'Employee ID',
  'Email',
  'Department',
  'First Name',
  'Job Title',
  'Last Name',
  'Location',
  'Role',
  'Address',
  'Groups',
];
const BO = [
  'EMP-1002',
  'bo.chan@acme.com',
  'Procurement',
  'Bo',
  'Sourcing Specialist',
  'Chan',
  'Ho Chi Minh City',
  'Responder',
  '45 Nguyen Hue Street',
  'Apparel',
];

describe('planTable', () => {
  it('maps a client table by header name and lists the ignored columns', () => {
    const plan = planTable(
      { headers: CLIENT_HEADER, rows: [BO] },
      { autoMatch: true },
    );
    expect(plan).toEqual({
      kind: 'insert',
      rows: [
        {
          email: 'bo.chan@acme.com',
          firstName: 'Bo',
          lastName: 'Chan',
          role: 'Responder',
          groups: 'Apparel',
        },
      ],
      ignored: [
        'Employee ID',
        'Department',
        'Job Title',
        'Location',
        'Address',
      ],
    });
  });

  it('matches alternative header names, ignoring case and punctuation', () => {
    const plan = planTable(
      {
        headers: ['E-mail', 'Given name', 'SURNAME', 'Access level'],
        rows: [['a@x.com', 'Ann', 'Lee', 'Viewer']],
      },
      { autoMatch: true },
    );
    expect(plan).toMatchObject({
      kind: 'insert',
      rows: [
        { email: 'a@x.com', firstName: 'Ann', lastName: 'Lee', role: 'Viewer' },
      ],
    });
  });

  it('holds the table when a required column has no match', () => {
    const table = {
      headers: ['Email', 'Nom', 'Apellido', 'Role'],
      rows: [['a@x.com', 'Ann', 'Lee', 'Viewer']],
    };
    expect(planTable(table, { autoMatch: true })).toEqual({
      kind: 'hold',
      table,
      mapping: ['email', null, null, 'role'],
    });
  });

  it('holds the table when two columns match one template column', () => {
    const plan = planTable(
      {
        headers: ['Email', 'E-mail', 'First name', 'Last name', 'Role'],
        rows: [['a@x.com', 'b@x.com', 'Ann', 'Lee', 'Viewer']],
      },
      { autoMatch: true },
    );
    expect(plan).toMatchObject({
      kind: 'hold',
      mapping: ['email', 'email', 'firstName', 'lastName', 'role'],
    });
  });

  it('holds every table, unmatched, when auto-match is off', () => {
    const plan = planTable(
      { headers: CLIENT_HEADER, rows: [BO] },
      { autoMatch: false },
    );
    expect(plan).toMatchObject({
      kind: 'hold',
      mapping: CLIENT_HEADER.map((): null => null),
    });
  });
});

describe('planPaste', () => {
  it('reads a first line that names a column as the header row', () => {
    expect(
      planPaste(tsv(CLIENT_HEADER, BO), { autoMatch: true }),
    ).toMatchObject({
      kind: 'insert',
      rows: [{ email: 'bo.chan@acme.com', groups: 'Apparel' }],
    });
    expect(
      planPaste(tsv(['Email', 'Notes'], ['a@x.com', 'hi']), {
        autoMatch: true,
      }),
    ).toMatchObject({
      kind: 'hold',
      table: { headers: ['Email', 'Notes'], rows: [['a@x.com', 'hi']] },
    });
  });

  it('keeps the positional paste for a header-less body of at most five columns', () => {
    expect(
      planPaste(tsv(['a@x.com', 'Ann', 'Lee', 'Viewer']), { autoMatch: true }),
    ).toEqual({
      kind: 'positional',
    });
    expect(planPaste('Ann Lee ann@x.com Viewer', { autoMatch: true })).toEqual({
      kind: 'positional',
    });
  });

  it('holds a header-less paste wider than the template, with numbered columns', () => {
    const plan = planPaste(tsv(BO), { autoMatch: true });
    expect(plan).toMatchObject({
      kind: 'hold',
      table: { headers: BO.map((_, i) => `Column ${i + 1}`), rows: [BO] },
    });
  });
});

describe('applyColumnMapping and mappingProblems', () => {
  const table = {
    headers: ['ID', 'Mail', 'Given', 'Family', 'Level'],
    rows: [['1', 'a@x.com', 'Ann', 'Lee', 'Viewer']],
  };

  it('fills template columns from the mapped pasted columns only', () => {
    expect(
      applyColumnMapping(table, [
        null,
        'email',
        'firstName',
        'lastName',
        'role',
      ]),
    ).toEqual({
      rows: [
        { email: 'a@x.com', firstName: 'Ann', lastName: 'Lee', role: 'Viewer' },
      ],
      ignored: ['ID'],
    });
  });

  it('does not name a column without a header among the ignored ones', () => {
    expect(
      applyColumnMapping({ headers: ['', 'Mail'], rows: [['x', 'a@x.com']] }, [
        null,
        'email',
      ]).ignored,
    ).toEqual([]);
  });

  it('names missing required columns and columns mapped twice', () => {
    expect(mappingProblems([null, 'email', 'email', 'lastName', null])).toEqual(
      [
        'Email is mapped from more than one column',
        'No column for First Name',
        'No column for Role',
      ],
    );
    expect(
      mappingProblems([null, 'email', 'firstName', 'lastName', 'role']),
    ).toEqual([]);
  });
});
