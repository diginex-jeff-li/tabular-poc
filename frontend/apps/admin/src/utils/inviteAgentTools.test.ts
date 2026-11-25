import { describe, expect, it } from 'vitest';
import {
  AddRowsOutputSchema,
  createInviteTools,
  DeleteRowsOutputSchema,
  ReadRowsOutputSchema,
  UpdateRowsOutputSchema,
} from './inviteAgentTools';
import { validateInvites } from './validateInvites';
import type { ColumnMapping, UnmappedTable } from './columnMapping';
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
  const agentProposed = new Set<string>();
  const pasted = {
    held: null as { table: UnmappedTable; mapping: ColumnMapping } | null,
    proposed: null as ColumnMapping | null,
  };
  const tools = createInviteTools({
    grid: () => grid,
    validate: (rows) =>
      validateInvites(rows, new Set(['jane.doe@acme.com']), agentProposed),
    agentProposed,
    unmappedTable: {
      current: () => pasted.held,
      propose: (mapping) => {
        pasted.proposed = mapping;
      },
    },
  });
  const call = (name: string, args: Record<string, unknown> = {}) =>
    tools.find((t) => t.name === name)!.execute(args) as Promise<
      Record<string, unknown>
    >;
  return { grid, tools, call, agentProposed, pasted };
}

const person = {
  email: 'a@acme.com',
  firstName: 'Ann',
  lastName: 'Lee',
  role: 'Viewer',
};

describe('invite agent tools', () => {
  it('offers no tool that sends invites or applies a column mapping', () => {
    expect(setup().tools.map((t) => t.name)).toEqual([
      'get_invite_form',
      'read_rows',
      'add_rows',
      'update_rows',
      'delete_rows',
      'validate',
      'read_pasted_table',
      'propose_column_mapping',
    ]);
  });

  describe('unmapped table', () => {
    const held = {
      table: {
        headers: ['Employee ID', 'Mail', 'Nom', 'Apellido', 'Access'],
        rows: Array.from({ length: 8 }, (_, i) => [
          `EMP-${i}`,
          `p${i}@acme.com`,
          'Ann',
          'Lee',
          'Viewer',
        ]),
      },
      mapping: [null, null, null, null, null] as ColumnMapping,
    };

    it('read_pasted_table reports nothing pending when no paste is held', async () => {
      expect(await setup().call('read_pasted_table')).toEqual({
        pending: false,
      });
    });

    it('read_pasted_table shows headers, at most five sample rows and what is missing', async () => {
      const { call, pasted } = setup();
      pasted.held = held;
      const result = await call('read_pasted_table');

      expect(result).toMatchObject({
        pending: true,
        headers: held.table.headers,
        rowCount: 8,
        mapping: [null, null, null, null, null],
        problems: expect.arrayContaining(['No column for Email']),
      });
      expect(result.sampleRows).toHaveLength(5);
      expect(result.templateColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'lastName',
            aliases: expect.arrayContaining(['surname']),
          }),
        ]),
      );
    });

    it('propose_column_mapping hands the mapping to the page and inserts nothing', async () => {
      const { call, pasted, grid } = setup();
      pasted.held = held;
      const mapping = [null, 'email', 'firstName', 'lastName', 'role'];

      const result = await call('propose_column_mapping', { mapping });

      expect(pasted.proposed).toEqual(mapping);
      expect(result).toEqual({ mapping, problems: [], applied: false });
      expect(grid.rows).toHaveLength(0);
    });

    it('propose_column_mapping rejects a mapping that does not fit the held table', async () => {
      const { call, pasted } = setup();
      await expect(
        call('propose_column_mapping', { mapping: [] }),
      ).rejects.toThrow(/no pasted table/i);
      pasted.held = held;
      await expect(
        call('propose_column_mapping', { mapping: ['email'] }),
      ).rejects.toThrow(/5 columns/);
      await expect(
        call('propose_column_mapping', {
          mapping: [null, 'mail', null, null, null],
        }),
      ).rejects.toThrow(/unknown template column "mail"/i);
      expect(pasted.proposed).toBeNull();
    });
  });

  it('add_rows accepts draft rows: any text per column, no extra keys, rules as hints', () => {
    const addRows = setup().tools.find((t) => t.name === 'add_rows')!;
    const item = (
      addRows.inputSchema as {
        properties: { rows: { items: Record<string, any> } };
      }
    ).properties.rows.items;

    expect(item.additionalProperties).toBe(false);
    expect(item.required ?? []).toEqual([]);
    expect(item.properties.email).not.toHaveProperty('format');
    expect(item.properties.role).not.toHaveProperty('enum');
    expect(item.properties.role.description).toContain('Account Admin');
    expect(item.properties.groups.description).toContain('Vietnam Suppliers');
  });

  it('results match their outputSchema even when rows hold invalid data', async () => {
    const { tools, call } = setup();
    const added = await call('add_rows', {
      rows: [
        person,
        { email: 'bad', role: 'Owner', groups: 'Mars' },
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

  it('takes groups as one "; " string and reads each row back with its status', async () => {
    const { call } = setup();
    await call('add_rows', {
      rows: [
        { ...person, groups: 'Apparel; Electronics' },
        { email: 'Tom Lee tom@acme.com Owner' },
        { ...person, email: 'bad' },
      ],
    });

    const { rows } = await call('read_rows');
    expect(rows).toEqual([
      expect.objectContaining({
        groups: 'Apparel; Electronics',
        status: 'Ready',
      }),
      expect.objectContaining({ status: 'Needs review' }),
      expect.objectContaining({ status: 'Not ready' }),
    ]);
  });

  it('update_rows that resolves a needs-review row marks it agent proposed', async () => {
    const { grid, call, agentProposed } = setup();
    await call('add_rows', {
      rows: [person, { email: 'Tom Lee tom@acme.com Owner' }],
    });
    const [plain, line] = grid.rows.map((r) => r.id as string);

    const result = await call('update_rows', {
      rows: [
        { id: plain, firstName: 'Anne' },
        { id: line, ...person, email: 'tom@acme.com', firstName: 'Tom' },
      ],
    });

    expect([...agentProposed]).toEqual([line]);
    expect(result.errors).toEqual([
      expect.objectContaining({ id: line, field: 'status' }),
    ]);
    const { rows } = await call('read_rows');
    expect(rows).toEqual([
      expect.objectContaining({ id: plain, status: 'Ready' }),
      expect.objectContaining({ id: line, status: 'Agent proposed' }),
    ]);
  });

  it('delete_rows refuses rows that need review and deletes nothing', async () => {
    const { grid, call } = setup();
    await call('add_rows', {
      rows: [person, { email: 'Kim Park kim park@acme.com Responder' }],
    });
    const ids = grid.rows.map((r) => r.id as string);

    await expect(call('delete_rows', { ids })).rejects.toThrow(
      /needs? review/i,
    );
    expect(grid.rows).toHaveLength(2);
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
