import { describe, expect, it } from 'vite-plus/test';
import { checkReadyRows } from './readyRows';

const existing = new Set(['jane.doe@acme.com']);
const noneProposed: ReadonlySet<string> = new Set();
const row = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  email: `${id}@acme.com`,
  firstName: 'Ann',
  lastName: 'Lee',
  role: 'Viewer',
  groups: null as string | null,
  ...overrides,
});
const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const TOM_LINE = { id: ID(1), email: 'Tom Lee tom@acme.com Owner' };

describe('checkReadyRows', () => {
  it('accepts valid rows with blank or several "; "-separated groups', () => {
    const check = checkReadyRows(
      [
        row(ID(1), { groups: '' }),
        row(ID(2), {
          email: 'b@acme.com',
          groups: 'Apparel;Electronics ; Vietnam Suppliers',
        }),
      ],
      existing,
      noneProposed,
    );
    expect(check.errors).toEqual([]);
    expect([check.statusOf(ID(1)), check.statusOf(ID(2))]).toEqual([
      'Ready',
      'Ready',
    ]);
  });

  it('flags the later copy of a duplicate email, case-insensitively, by row id', () => {
    const check = checkReadyRows(
      [
        row(ID(1), { email: 'a@acme.com' }),
        row(ID(2), { email: ' A@ACME.com ' }),
      ],
      existing,
      noneProposed,
    );
    expect(check.errors).toEqual([
      expect.objectContaining({
        rowId: ID(2),
        field: 'email',
        message: 'Duplicate of row 1',
      }),
    ]);
    expect([check.statusOf(ID(1)), check.statusOf(ID(2))]).toEqual([
      'Ready',
      'Not ready',
    ]);
  });

  it('flags emails that already have an account', () => {
    const check = checkReadyRows(
      [row(ID(1), { email: 'Jane.Doe@acme.com' })],
      existing,
      noneProposed,
    );
    expect(check.errors).toEqual([
      expect.objectContaining({ rowId: ID(1), field: 'email' }),
    ]);
    expect(check.statusOf(ID(1))).toBe('Not ready');
  });

  it('flags the role and each unknown group name', () => {
    const check = checkReadyRows(
      [
        row(ID(1), {
          email: 'x@acme.com',
          role: 'Owner',
          groups: 'Apparel; Mars; Moon',
        }),
      ],
      existing,
      noneProposed,
    );
    expect(
      check.errors.map((e) => [
        e.field,
        e.message.startsWith('Unknown') ? e.message : '',
      ]),
    ).toEqual([
      ['role', ''],
      ['groups', 'Unknown group(s): Mars, Moon'],
    ]);
  });

  it('reports a needs-review line once, on its cell, instead of field errors', () => {
    const check = checkReadyRows([TOM_LINE], existing, noneProposed);
    expect(check.errors).toEqual([
      expect.objectContaining({
        rowId: ID(1),
        field: 'email',
        message: expect.stringMatching(/^Needs review/),
      }),
    ]);
    expect(check.statusOf(ID(1))).toBe('Needs review');
  });

  it('a row that needs review shows that before agent proposed', () => {
    const check = checkReadyRows([TOM_LINE], existing, new Set([ID(1)]));
    expect(check.statusOf(ID(1))).toBe('Needs review');
    expect(check.errors).toEqual([
      expect.objectContaining({
        message: expect.stringMatching(/^Needs review/),
      }),
    ]);
  });

  it('an otherwise valid agent-proposed row is not ready and blocks Send', () => {
    const check = checkReadyRows([row(ID(1))], existing, new Set([ID(1)]));
    expect(check.statusOf(ID(1))).toBe('Agent proposed');
    expect(check.errors).toEqual([
      expect.objectContaining({
        rowId: ID(1),
        field: 'status',
        message: 'Agent proposed: confirm or edit this row before sending',
      }),
    ]);
  });

  it('an agent-proposed row still reports its field errors', () => {
    const check = checkReadyRows(
      [row(ID(1), { role: 'Owner' })],
      existing,
      new Set([ID(1)]),
    );
    expect(check.statusOf(ID(1))).toBe('Agent proposed');
    expect(check.errors.map((e) => e.field)).toEqual(['status', 'role']);
  });

  it('a row the check did not see is not ready', () => {
    const check = checkReadyRows([], existing, noneProposed);
    expect(check.statusOf(ID(1))).toBe('Not ready');
  });
});
