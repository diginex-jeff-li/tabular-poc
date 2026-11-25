import { describe, expect, it } from 'vitest';
import {
  AddRowsOutputSchema,
  createInviteTools,
  DeleteRowsOutputSchema,
  ReadRowsOutputSchema,
  UpdateRowsOutputSchema,
} from './inviteAgentTools';
import { validateInvites } from './validateInvites';
import type { GridApi } from 'composables/useGridEditor';

// In-memory stand-in for the Tabulator-backed grid API.
function fakeGrid(): GridApi & { rows: Record<string, unknown>[] } {
  let next = 0;
  const rows: Record<string, unknown>[] = [];
  return {
    rows,
    getRows: () => rows.map((r) => ({ ...r })),
    addRows: async (added) => {
      const ids = added.map(
        () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`,
      );
      added.forEach((r, i) => rows.push({ ...r, id: ids[i] }));
      return ids;
    },
    updateRows: async (patches) => {
      const result = { updated: [] as string[], missing: [] as string[] };
      for (const { id, ...fields } of patches) {
        const row = rows.find((r) => r.id === id);
        if (row) {
          Object.assign(row, fields);
          result.updated.push(id);
        } else result.missing.push(id);
      }
      return result;
    },
    deleteRows: (ids) => {
      const result = { deleted: [] as string[], missing: [] as string[] };
      for (const id of ids) {
        const index = rows.findIndex((r) => r.id === id);
        if (index < 0) result.missing.push(id);
        else
          result.deleted.push(
            ...rows.splice(index, 1).map((r) => r.id as string),
          );
      }
      return result;
    },
    showErrors: () => {},
  };
}

function setup() {
  const grid = fakeGrid();
  const tools = createInviteTools({
    grid: () => grid,
    validate: (rows) => validateInvites(rows, new Set(['jane.doe@acme.com'])),
  });
  const call = (name: string, args: Record<string, unknown> = {}) =>
    tools.find((t) => t.name === name)!.execute(args) as Promise<
      Record<string, unknown>
    >;
  return { grid, tools, call };
}

const person = {
  email: 'a@acme.com',
  firstName: 'Ann',
  lastName: 'Lee',
  role: 'Viewer',
};

describe('invite agent tools', () => {
  it('offers no tool that sends invites', () => {
    expect(setup().tools.map((t) => t.name)).toEqual([
      'get_invite_form',
      'read_rows',
      'add_rows',
      'update_rows',
      'delete_rows',
      'validate',
    ]);
  });

  it('add_rows input schema carries the contract rules for each row', () => {
    const addRows = setup().tools.find((t) => t.name === 'add_rows')!;

    expect(addRows.inputSchema).toMatchObject({
      properties: {
        rows: {
          items: {
            required: ['email', 'firstName', 'lastName', 'role'],
            additionalProperties: false,
            properties: {
              email: { type: 'string', format: 'email' },
              firstName: { minLength: 1, maxLength: 100 },
              role: { enum: expect.arrayContaining(['Viewer']) },
              groups: { items: { enum: expect.arrayContaining(['Apparel']) } },
            },
          },
        },
      },
    });
  });

  it('results match their outputSchema even when rows hold invalid data', async () => {
    const { tools, call } = setup();
    const added = await call('add_rows', {
      rows: [
        person,
        { email: 'bad', role: 'Owner', groups: ['Mars'] },
        { firstName: 42 },
      ],
    });
    const [first, second] = (added as { added: string[] }).added;
    const updated = await call('update_rows', {
      rows: [
        { id: first, role: 'Owner' },
        { id: 'nope', role: 'Viewer' },
      ],
    });
    const deleted = await call('delete_rows', { ids: [second, 'gone'] });
    const read = await call('read_rows');

    expect(AddRowsOutputSchema.safeParse(added).success).toBe(true);
    expect(UpdateRowsOutputSchema.safeParse(updated).success).toBe(true);
    expect(DeleteRowsOutputSchema.safeParse(deleted).success).toBe(true);
    expect(ReadRowsOutputSchema.safeParse(read).success).toBe(true);
    expect(updated).toMatchObject({ updated: [first], missingIds: ['nope'] });
    expect(deleted).toMatchObject({ deleted: [second], missingIds: ['gone'] });
    expect(tools.filter((t) => t.outputSchema).map((t) => t.name)).toEqual([
      'read_rows',
      'add_rows',
      'update_rows',
      'delete_rows',
    ]);
  });

  it("add_rows ignores agent-supplied ids and unknown fields, and returns the new rows' errors", async () => {
    const { grid, call } = setup();
    const result = await call('add_rows', {
      rows: [
        person,
        { ...person, id: 'forged', isAdmin: true, email: 'jane.doe@acme.com' },
      ],
    });

    expect(grid.rows[1]).not.toHaveProperty('isAdmin');
    expect(grid.rows[1].id).not.toBe('forged');
    expect(result.errors).toEqual([
      {
        id: grid.rows[1].id,
        field: 'email',
        message: 'jane.doe@acme.com already has an account',
      },
    ]);
  });

  it('takes groups as an array, stores one "; " cell, and reads them back as an array', async () => {
    const { grid, call } = setup();
    await call('add_rows', {
      rows: [{ ...person, groups: ['Apparel', 'Electronics'] }],
    });

    expect(grid.rows[0].groups).toBe('Apparel; Electronics');
    const { rows } = await call('read_rows');
    expect(rows).toEqual([
      expect.objectContaining({ groups: ['Apparel', 'Electronics'] }),
    ]);
  });

  it('update_rows fixes a row by id and reports ids that do not exist', async () => {
    const { grid, call } = setup();
    await call('add_rows', { rows: [person, { ...person }] });
    const second = grid.rows[1].id as string;

    const result = await call('update_rows', {
      rows: [
        { id: second, email: 'b@acme.com' },
        { id: 'nope', role: 'Viewer' },
      ],
    });

    expect(result).toMatchObject({
      updated: [second],
      missingIds: ['nope'],
      totalErrors: 0,
    });
    expect(grid.rows[0].email).toBe('a@acme.com');
  });

  it('rejects a call whose rows argument is not an array', async () => {
    await expect(setup().call('add_rows', { rows: 'Ann' })).rejects.toThrow(
      '"rows" must be an array',
    );
  });
});
