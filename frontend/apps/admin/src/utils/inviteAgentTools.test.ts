import { describe, expect, it } from 'vite-plus/test';
import {
  AddRowsOutputSchema,
  createInviteTools,
  DeleteRowsOutputSchema,
  ReadRowsOutputSchema,
  UpdateRowsOutputSchema,
} from './inviteAgentTools';
import { createInviteDraft } from './inviteDraft';
import { createMemoryGrid } from './memoryGridApi';

// Tool contract only: names, schemas, argument handling and output shapes.
// The rules behind each tool are tested on the invite draft module.
function setup() {
  const grid = createMemoryGrid();
  const draft = createInviteDraft(() => grid, {
    existingEmails: new Set(['jane.doe@acme.com']),
  });
  const tools = createInviteTools(draft);
  const call = (name: string, args: Record<string, unknown> = {}) =>
    tools.find((t) => t.name === name)!.execute(args) as Promise<
      Record<string, unknown>
    >;
  return { grid, draft, tools, call };
}

const person = {
  email: 'a@acme.com',
  firstName: 'Ann',
  lastName: 'Lee',
  role: 'Viewer',
};

describe('invite agent tools', () => {
  it('offers no tool that sends invites, confirms a row or applies a column mapping', () => {
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

  it('acts as the agent: update_rows marks a resolved line, delete_rows is refused for it', async () => {
    const { grid, call } = setup();
    await call('add_rows', { rows: [{ email: 'Tom Lee tom@acme.com Owner' }] });
    const tom = grid.rows[0].id as string;
    await call('update_rows', {
      rows: [{ id: tom, ...person, email: 'tom@acme.com', firstName: 'Tom' }],
    });

    const { rows } = await call('read_rows');
    expect(rows).toEqual([
      expect.objectContaining({ id: tom, status: 'Agent proposed' }),
    ]);
    await expect(call('delete_rows', { ids: [tom] })).rejects.toThrow(
      /agent proposed/i,
    );
  });

  it('rejects a call whose array argument is not an array', async () => {
    const { call } = setup();
    await expect(call('add_rows', { rows: 'Ann' })).rejects.toThrow(
      '"rows" must be an array',
    );
    await expect(
      call('propose_column_mapping', { mapping: 'email' }),
    ).rejects.toThrow('"mapping" must be an array');
  });

  it('read_pasted_table and propose_column_mapping expose the held paste and fill its mapping', async () => {
    const { draft, call } = setup();
    expect(await call('read_pasted_table')).toEqual({ pending: false });

    const header = ['Employee ID', 'Work Email', 'Nom', 'Apellido', 'Access'];
    const body = Array.from({ length: 8 }, (_, i) => [
      `E${i}`,
      `p${i}@acme.com`,
      'Ann',
      'Lee',
      'Viewer',
    ]);
    draft.paste(
      [header, ...body].map((r) => r.join('\t')).join('\n'),
      { autoMatch: true },
      () => [],
    );

    const read = await call('read_pasted_table');
    expect(read).toMatchObject({ pending: true, headers: header, rowCount: 8 });
    expect(read.sampleRows).toHaveLength(5);

    const mapping = [null, 'email', 'firstName', 'lastName', 'role'];
    expect(await call('propose_column_mapping', { mapping })).toEqual({
      mapping,
      problems: [],
      applied: false,
    });
    expect(draft.held.value?.mapping).toEqual(mapping);
  });
});
