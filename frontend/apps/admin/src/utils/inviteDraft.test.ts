import { describe, expect, it } from 'vitest';
import { createInviteDraft } from './inviteDraft';
import { createMemoryGrid } from './memoryGridApi';

function setup() {
  const grid = createMemoryGrid();
  const draft = createInviteDraft(() => grid, {
    existingEmails: new Set(['jane.doe@acme.com']),
  });
  return { grid, draft };
}

const ann = {
  email: 'ann@acme.com',
  firstName: 'Ann',
  lastName: 'Lee',
  role: 'Viewer',
};
const TOM_LINE = { email: 'Tom Lee tom@acme.com Owner' };
const tomFixed = {
  email: 'tom@acme.com',
  firstName: 'Tom',
  lastName: 'Lee',
  role: 'Viewer',
};
const statuses = (draft: ReturnType<typeof setup>['draft']) =>
  draft.rows().map((r) => r.status);

describe('invite draft', () => {
  it('normalizes what is added, checks every row and paints the errors', async () => {
    const { draft, grid } = setup();
    await draft.add([
      { ...ann, email: ' ANN@acme.com ', role: 'viewer' },
      { ...ann, email: 'jane.doe@acme.com' },
      TOM_LINE,
    ]);

    expect(draft.rows()[0]).toMatchObject({
      email: 'ann@acme.com',
      role: 'Viewer',
    });
    expect(statuses(draft)).toEqual(['Ready', 'Not ready', 'Needs review']);
    expect(grid.shown).toEqual(draft.errors());
  });

  describe('agent proposed', () => {
    async function proposed() {
      const s = setup();
      const [tom] = await s.draft.add([TOM_LINE]);
      await s.draft.update([{ id: tom, ...tomFixed }], 'agent');
      return { ...s, tom };
    }

    it('an agent resolving a needs-review row marks it and blocks Send', async () => {
      const { draft } = await proposed();
      expect(statuses(draft)).toEqual(['Agent proposed']);
      expect(draft.send()).toMatchObject({ saved: 0 });
    });

    it('a person confirming it unblocks Send', async () => {
      const { draft, tom } = await proposed();
      draft.confirm(tom);
      expect(statuses(draft)).toEqual(['Ready']);
      expect(draft.send()).toEqual({ errors: [], saved: 1 });
    });

    it('a person editing it, here or in the grid, clears the mark', async () => {
      const a = await proposed();
      await a.draft.update([{ id: a.tom, firstName: 'Thomas' }], 'person');
      expect(statuses(a.draft)).toEqual(['Ready']);

      const b = await proposed();
      b.draft.edited([b.tom]);
      expect(statuses(b.draft)).toEqual(['Ready']);
    });

    it('an agent editing a row that did not need review does not mark it', async () => {
      const { draft } = setup();
      const [id] = await draft.add([ann]);
      await draft.update([{ id, firstName: 'Anne' }], 'agent');
      expect(statuses(draft)).toEqual(['Ready']);
    });

    it('an agent cannot delete it and swap in an unmarked copy', async () => {
      const { draft, tom, grid } = await proposed();
      expect(() => draft.remove([tom], 'agent')).toThrow(/agent proposed/i);
      expect(grid.rows).toHaveLength(1);
      draft.remove([tom], 'person');
      expect(grid.rows).toHaveLength(0);
    });
  });

  it('an agent cannot delete a row that needs review; nothing is deleted', async () => {
    const { draft, grid } = setup();
    const ids = await draft.add([ann, TOM_LINE]);
    expect(() => draft.remove(ids, 'agent')).toThrow(/need review/i);
    expect(grid.rows).toHaveLength(2);
  });

  it('re-checks after a delete: the surviving duplicate becomes ready', async () => {
    const { draft } = setup();
    const [, second] = await draft.add([ann, ann]);
    expect(statuses(draft)).toEqual(['Ready', 'Not ready']);
    draft.remove([second], 'person');
    expect(statuses(draft)).toEqual(['Ready']);
  });

  describe('unmapped table', () => {
    // One known header (Work Email) makes the first line a header row; the
    // other three have no match, so the paste is held.
    const PASTE = [
      'Work Email\tNom\tApellido\tAccess',
      'ann@acme.com\tAnn\tLee\tViewer',
    ].join('\n');
    const positional = () => [{ email: 'positional' }];

    it('holds a paste it cannot match and inserts nothing', () => {
      const { draft } = setup();
      expect(draft.paste(PASTE, { autoMatch: true }, positional)).toEqual({
        rows: [],
        ignored: [],
      });
      expect(draft.held.value?.table.headers).toEqual([
        'Work Email',
        'Nom',
        'Apellido',
        'Access',
      ]);
      expect(draft.held.value?.mapping).toEqual(['email', null, null, null]);
    });

    it('the agent proposes, a person applies, and the rows enter the draft', async () => {
      const { draft } = setup();
      draft.paste(PASTE, { autoMatch: true }, positional);

      expect(
        draft.proposeMapping(['email', 'firstName', 'lastName', 'role']),
      ).toEqual([]);
      expect(draft.held.value?.agentColumns).toEqual([0, 1, 2, 3]);
      draft.setMappingColumn(3, 'role');
      expect(draft.held.value?.agentColumns).toEqual([0, 1, 2]);

      expect(await draft.applyMapping()).toEqual({ added: 1, ignored: [] });
      expect(draft.held.value).toBeNull();
      expect(statuses(draft)).toEqual(['Ready']);
    });

    it('refuses to apply an incomplete mapping and rejects a mapping that does not fit', async () => {
      const { draft } = setup();
      expect(() => draft.proposeMapping([])).toThrow(/no pasted table/i);
      draft.paste(PASTE, { autoMatch: true }, positional);
      await expect(draft.applyMapping()).rejects.toThrow(
        /No column for First Name/,
      );
      expect(() => draft.proposeMapping(['email'])).toThrow(/4 columns/);
      expect(() => draft.proposeMapping(['email', 'mail', null, null])).toThrow(
        /unknown template column "mail"/i,
      );
    });

    it('a template-shaped body still pastes by position', () => {
      const { draft } = setup();
      expect(
        draft.paste('ann@acme.com\tAnn', { autoMatch: true }, positional).rows,
      ).toEqual(positional());
    });
  });
});
