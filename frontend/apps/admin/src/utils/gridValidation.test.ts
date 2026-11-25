import { describe, it, expect } from 'vite-plus/test';
import { z } from 'zod';
import { indexSaveErrors, validateRows } from './gridValidation';
import { zodToColumnDefs } from './zodToColumnDefs';

const COLUMNS = zodToColumnDefs(
  z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    role: z.enum(['admin', 'viewer']),
    note: z.string().nullable(),
  }),
);

describe('validateRows', () => {
  it('lists only invalid cells, keyed by row id and column id', () => {
    const messages = validateRows(
      [
        { id: 'ok', email: 'a@b.co', role: 'admin', note: null },
        { id: 'bad', email: '', role: 'owner', note: 'x' },
      ],
      COLUMNS,
    );
    expect([...messages.keys()]).toEqual(['bad']);
    expect(messages.get('bad')).toEqual({
      email: 'Required',
      role: 'Must be one of: admin, viewer',
    });
  });

  it('treats a missing field like a blank one', () => {
    const messages = validateRows([{ id: 'new' }], COLUMNS);
    expect(messages.get('new')).toEqual({
      email: 'Required',
      role: 'Required',
    });
  });

  it('uses the field’s own Zod message for a bad string', () => {
    const messages = validateRows(
      [{ id: 'r', email: 'nora@@acme.com', role: 'viewer' }],
      COLUMNS,
    );
    expect(messages.get('r')).toEqual({ email: 'Invalid email address' });
  });
});

describe('indexSaveErrors', () => {
  it('keys backend errors by row id and field, first message first', () => {
    const messages = indexSaveErrors([
      { row: 0, rowId: 'a', field: 'email', message: 'Taken' },
      { row: 0, rowId: 'a', field: 'email', message: 'Second' },
      { row: 2, rowId: 'c', field: 'role', message: 'Bad role' },
    ]);
    expect(messages.get('a')).toEqual({ email: 'Taken' });
    expect(messages.get('c')).toEqual({ role: 'Bad role' });
    expect(messages.has('b')).toBe(false);
  });
});
