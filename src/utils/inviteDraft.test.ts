import { useDataGrid } from 'composables/useDataGrid';
import { normalizeInviteRow } from 'utils/draftRow';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { effectScope } from 'vue';
import { createInviteDraft, describeOutcome } from './inviteDraft';
import type { InviteDraft, InviteDraftStore, StoredDraft } from './inviteDraft';
import type { EffectScope } from 'vue';

// The draft runs on the page's grid adapter, headless: each grid in its own
// scope, stopped after the test, so window listeners never outlive it. As on
// the page, the grid reports a person's writes to the draft (`edited`).
const scopes: Array<EffectScope> = [];

function setup(store?: InviteDraftStore) {
  const scope = effectScope();
  scopes.push(scope);
  const grid = scope.run(() =>
    useDataGrid({
      data: [],
      columns: [],
      onSave: vi.fn(),
      normalizeRow: normalizeInviteRow,
      onUserEdit: (ids) => draft.edited(ids),
    }),
  );
  const draft = createInviteDraft(() => grid.api, {
    existingEmails: new Set(['jane.doe@acme.com']),
    store,
  });
  /** A person ticks the rows and deletes them in the grid. */
  const personDeletes = (ids: Array<string>) => {
    for (const id of ids) {
      grid.setRowSelected(id, true);
    }
    grid.deleteSelected();
  };
  return { grid, draft, personDeletes };
}

/** The test adapter for the draft's store: a plain object. */
function memoryStore(restored: StoredDraft | null = null) {
  const store = {
    restored,
    saved: null as StoredDraft | null,
    save(rows: Array<Record<string, unknown>>, agentProposed: Array<string>) {
      store.saved = {
        rows: rows.map((row) => ({ ...row, id: String(row.id) })),
        agentProposed,
      };
    },
  };
  return store;
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
const statuses = (draft: InviteDraft) => draft.rows().map((r) => r.status);

describe('invite draft', () => {
  afterEach(() => {
    for (const scope of scopes.splice(0)) {
      scope.stop();
    }
  });

  it('normalizes what a person imports, checks every row and paints the errors', () => {
    const { draft, grid } = setup();
    draft.importRows([
      { ...ann, email: ' ANN@acme.com ', role: 'viewer' },
      { ...ann, email: 'jane.doe@acme.com' },
      TOM_LINE,
    ]);

    expect(draft.rows()[0]).toMatchObject({
      email: 'ann@acme.com',
      role: 'Viewer',
    });
    expect(statuses(draft)).toEqual(['Ready', 'Not ready', 'Needs review']);
    expect(grid.errorList.value).toEqual(draft.errors());
  });

  describe('agent proposed', () => {
    function proposed() {
      const s = setup();
      const [tom] = s.draft.importRows([TOM_LINE]);
      s.draft.update([{ id: tom, ...tomFixed }]);
      return { ...s, tom };
    }

    it('an agent resolving a needs-review row marks it and blocks Send', () => {
      const { draft } = proposed();
      expect(statuses(draft)).toEqual(['Agent proposed']);
      expect(draft.send()).toMatchObject({ saved: 0 });
    });

    it('a person confirming it unblocks Send', () => {
      const { draft, tom } = proposed();
      draft.confirm(tom);
      expect(statuses(draft)).toEqual(['Ready']);
      expect(draft.send()).toEqual({ errors: [], saved: 1 });
    });

    it('a person editing it in the grid clears the mark', () => {
      const { draft, grid, tom } = proposed();
      grid.editCell({ rowId: tom, colId: 'firstName' }, 'Thomas');
      expect(statuses(draft)).toEqual(['Ready']);
    });

    it('an agent editing a row that did not need review does not mark it', () => {
      const { draft } = setup();
      const [id] = draft.importRows([ann]);
      draft.update([{ id, firstName: 'Anne' }]);
      expect(statuses(draft)).toEqual(['Ready']);
    });

    it('an agent cannot delete it and swap in an unmarked copy; a person can delete it', () => {
      const { draft, tom, grid, personDeletes } = proposed();
      expect(() => draft.remove([tom])).toThrow(/agent proposed/i);
      expect(grid.rows.value).toHaveLength(1);
      personDeletes([tom]);
      expect(grid.rows.value).toHaveLength(0);
    });
  });

  it('an agent cannot delete a row that needs review; nothing is deleted', () => {
    const { draft, grid } = setup();
    const ids = draft.add([ann, TOM_LINE]);
    expect(() => draft.remove(ids)).toThrow(/need review/i);
    expect(grid.rows.value).toHaveLength(2);
  });

  it('re-checks after a person deletes: the surviving duplicate becomes ready', () => {
    const { draft, personDeletes } = setup();
    const [, second] = draft.importRows([ann, ann]);
    expect(statuses(draft)).toEqual(['Ready', 'Not ready']);
    personDeletes([second]);
    expect(statuses(draft)).toEqual(['Ready']);
  });

  describe('kept in its store', () => {
    it('saves the rows and the agent-proposed ids after every write', () => {
      const store = memoryStore();
      const { draft } = setup(store);
      const [annId, tom] = draft.importRows([ann, TOM_LINE]);
      expect(store.saved).toEqual({
        rows: [
          expect.objectContaining({ id: annId, email: 'ann@acme.com' }),
          expect.objectContaining({ id: tom }),
        ],
        agentProposed: [],
      });

      draft.update([{ id: tom, ...tomFixed }]);
      expect(store.saved?.agentProposed).toEqual([tom]);

      draft.confirm(tom);
      expect(store.saved?.agentProposed).toEqual([]);
    });

    it('restores with fresh ids; an agent-proposed row still blocks Send', () => {
      const store = memoryStore({
        rows: [
          { id: 'old-ann', ...ann },
          { id: 'old-tom', ...tomFixed },
        ],
        agentProposed: ['old-tom'],
      });
      const { draft } = setup(store);
      draft.resume();

      const restored = draft.rows();
      expect(restored.map((r) => r.email)).toEqual([
        'ann@acme.com',
        'tom@acme.com',
      ]);
      expect(restored.map((r) => r.id)).not.toContain('old-ann');
      expect(restored.map((r) => r.id)).not.toContain('old-tom');
      expect(statuses(draft)).toEqual(['Ready', 'Agent proposed']);
      expect(draft.send()).toMatchObject({ saved: 0 });
      expect(store.saved?.agentProposed).toEqual([restored[1].id]);

      draft.confirm(restored[1].id);
      expect(draft.send()).toEqual({ errors: [], saved: 2 });
    });

    it('restores only once', () => {
      const store = memoryStore({
        rows: [{ id: 'old-ann', ...ann }],
        agentProposed: [],
      });
      const { draft } = setup(store);
      draft.resume();
      draft.resume();
      expect(draft.rows()).toHaveLength(1);
    });
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
      const { rows, outcome } = draft.paste(
        PASTE,
        { autoMatch: true },
        positional,
      );
      expect(rows).toEqual([]);
      expect(describeOutcome(outcome, 'paste')).toBe(
        'The paste needs a column mapping before it enters the draft.',
      );
      expect(draft.held.value?.table.headers).toEqual([
        'Work Email',
        'Nom',
        'Apellido',
        'Access',
      ]);
      expect(draft.held.value?.mapping).toEqual(['email', null, null, null]);
    });

    it('the agent proposes, a person applies, and the rows enter the draft', () => {
      const { draft } = setup();
      draft.paste(PASTE, { autoMatch: true }, positional);

      expect(
        draft.proposeMapping(['email', 'firstName', 'lastName', 'role']),
      ).toEqual([]);
      expect(draft.held.value?.agentColumns).toEqual([0, 1, 2, 3]);
      draft.setMappingColumn(3, 'role');
      expect(draft.held.value?.agentColumns).toEqual([0, 1, 2]);

      const outcome = draft.applyMapping();
      expect(outcome).toEqual({
        kind: 'added',
        added: 1,
        ignored: [],
        errors: 0,
      });
      expect(describeOutcome(outcome, 'mapping')).toBe(
        'Added 1 row from the mapped table; 0 errors to fix.',
      );
      expect(draft.held.value).toBeNull();
      expect(statuses(draft)).toEqual(['Ready']);
    });

    it('refuses to apply an incomplete mapping and rejects a mapping that does not fit', () => {
      const { draft } = setup();
      expect(() => draft.proposeMapping([])).toThrow(/no table waiting/i);
      draft.paste(PASTE, { autoMatch: true }, positional);
      expect(() => draft.applyMapping()).toThrow(/No column for First Name/);
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

    it('a header paste goes back to the grid, naming the ignored columns', () => {
      const { draft, grid } = setup();
      const { rows, outcome } = draft.paste(
        'Email\tFirst name\tLast name\tRole\tNotes\nann@acme.com\tAnn\tLee\tViewer\tvip',
        { autoMatch: true },
        positional,
      );
      expect(rows).toEqual([
        {
          email: 'ann@acme.com',
          firstName: 'Ann',
          lastName: 'Lee',
          role: 'Viewer',
        },
      ]);
      expect(grid.rows.value).toHaveLength(0);
      expect(describeOutcome(outcome, 'paste')).toBe(
        'Added 1 row from the paste. Ignored columns: Notes.',
      );
    });
  });

  describe('importing a table', () => {
    const FILE = { file: 'people.xlsx' };

    it('adds a table whose headers match, naming ignored columns and errors left', () => {
      const { draft } = setup();
      const outcome = draft.importTable(
        {
          headers: ['Email', 'First Name', 'Last Name', 'Role', 'Notes'],
          rows: [
            ['ann@acme.com', 'Ann', 'Lee', 'Viewer', 'vip'],
            ['jane.doe@acme.com', 'Jane', 'Doe', 'Viewer', ''],
          ],
        },
        { autoMatch: true },
      );
      expect(outcome).toEqual({
        kind: 'added',
        added: 2,
        ignored: ['Notes'],
        errors: 1,
      });
      expect(statuses(draft)).toEqual(['Ready', 'Not ready']);
      expect(describeOutcome(outcome, FILE)).toBe(
        'Added 2 rows from people.xlsx; 1 error to fix. Ignored columns: Notes.',
      );
    });

    it('holds a table missing a template column and adds nothing; Apply adds it', () => {
      const { draft } = setup();
      const outcome = draft.importTable(
        {
          headers: ['Email', 'Given name', 'Surname', 'Access'],
          rows: [['cy@acme.com', 'Cy', 'Ng', 'Viewer']],
        },
        { autoMatch: true },
      );
      expect(outcome).toEqual({ kind: 'held' });
      expect(draft.rows()).toEqual([]);
      expect(draft.held.value?.mapping).toEqual([
        'email',
        'firstName',
        'lastName',
        null,
      ]);
      expect(describeOutcome(outcome, FILE)).toBe(
        'people.xlsx needs a column mapping before it enters the draft.',
      );

      draft.setMappingColumn(3, 'role');
      expect(draft.applyMapping()).toMatchObject({ kind: 'added', added: 1 });
      expect(draft.rows().map((r) => r.email)).toEqual(['cy@acme.com']);
    });

    it('holds even a matching table, unmatched, when auto-match is off', () => {
      const { draft } = setup();
      const outcome = draft.importTable(
        {
          headers: ['Email', 'First Name', 'Last Name', 'Role'],
          rows: [['ann@acme.com', 'Ann', 'Lee', 'Viewer']],
        },
        { autoMatch: false },
      );
      expect(outcome).toEqual({ kind: 'held' });
      expect(draft.rows()).toEqual([]);
      expect(draft.held.value?.mapping).toEqual([null, null, null, null]);
    });
  });
});
