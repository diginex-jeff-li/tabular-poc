import { describe, expect, it } from 'vitest';
import { validateInvites } from './validateInvites';

const existing = new Set(['jane.doe@acme.com']);
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

describe('validateInvites', () => {
  it('accepts valid rows with blank or several "; "-separated groups', () => {
    expect(
      validateInvites(
        [
          row(ID(1), { groups: '' }),
          row(ID(2), {
            email: 'b@acme.com',
            groups: 'Apparel;Electronics ; Vietnam Suppliers',
          }),
        ],
        existing,
      ),
    ).toEqual([]);
  });

  it('flags the later copy of a duplicate email, case-insensitively, by row id', () => {
    const errors = validateInvites(
      [
        row(ID(1), { email: 'a@acme.com' }),
        row(ID(2), { email: ' A@ACME.com ' }),
      ],
      existing,
    );
    expect(errors).toEqual([
      expect.objectContaining({
        rowId: ID(2),
        field: 'email',
        message: 'Duplicate of row 1',
      }),
    ]);
  });

  it('flags emails that already have an account', () => {
    const errors = validateInvites(
      [row(ID(1), { email: 'Jane.Doe@acme.com' })],
      existing,
    );
    expect(errors).toEqual([
      expect.objectContaining({ rowId: ID(1), field: 'email' }),
    ]);
  });

  it('flags the role and each unknown group name', () => {
    const errors = validateInvites(
      [
        row(ID(1), {
          email: 'x@acme.com',
          role: 'Owner',
          groups: 'Apparel; Mars; Moon',
        }),
      ],
      existing,
    );
    expect(
      errors.map((e) => [
        e.field,
        e.message.startsWith('Unknown') ? e.message : '',
      ]),
    ).toEqual([
      ['role', ''],
      ['groups', 'Unknown group(s): Mars, Moon'],
    ]);
  });
});
