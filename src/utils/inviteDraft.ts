import { INVITE_FIELDS } from 'contracts';
import {
  applyColumnMapping,
  planPaste,
  planTable,
  tableMapping,
} from 'utils/columnMapping';
import { draftFields, needsReview } from 'utils/draftRow';
import { checkReadyRows } from 'utils/readyRows';
import { shallowRef } from 'vue';
import type { InviteField } from 'contracts';
import type {
  ColumnMapping,
  TableMapping,
  UnmappedTable,
} from 'utils/columnMapping';
import type { GridApi, GridSaveError, GridSaveResponse } from 'utils/gridApi';
import type { InviteRowStatus } from 'utils/readyRows';
import type { ShallowRef } from 'vue';

/**
 * PROTOTYPE — the invite draft (CONTEXT.md): every rule about who may change
 * which rows, behind one interface. The page and the agent tools are thin
 * adapters over it; rows themselves live behind the `GridApi` seam
 * (`useDataGrid`'s `api`, built with `normalizeRow: normalizeInviteRow`, so
 * the grid normalizes every row the draft writes).
 *
 * Who writes:
 * - `add`, `update` and `remove` are the agent's writes (the grid's agent
 *   write: not undoable)
 * - a person writes in the grid, or brings a table through the grid's
 *   `importRows` (a person write: one undo step; `importTable` and
 *   `applyMapping` use it).
 *   Those writes reach the draft only through `edited`, so the grid's
 *   `onUserEdit` must call `edited`; that call runs the check after a
 *   person's write
 *
 * Rules it owns:
 * - every write is followed by a full check and repaint, then a save to the
 *   draft's store (if it has one)
 * - an agent resolving a needs-review row makes it agent proposed; a person
 *   confirming or editing the row clears that
 * - agent proposed travels with the rows: the store keeps it, and a restored
 *   row that was agent proposed still needs a person's Confirm
 * - an agent cannot delete a row that needs review or is agent proposed
 * - a paste or an imported table whose columns don't match is held as an
 *   unmapped table; the agent may propose a column mapping, only a person
 *   applies it
 * - Send passes only when every row is ready
 */

export type DraftRowView = { id: string } & Record<
  InviteField,
  string | null
> & { status: InviteRowStatus };

/** An unmapped table waiting for a person to apply its column mapping. */
export interface HeldTable extends TableMapping {
  /** Columns whose mapping the agent proposed and no person has changed. */
  agentColumns: Array<number>;
}

/**
 * What a paste, an import or an applied column mapping did: rows added (with
 * the ignored columns and the errors left in the draft, null when the grid
 * has not written the rows yet), or the table held for a column mapping.
 */
export type TableOutcome =
  | { kind: 'held' }
  | {
      kind: 'added';
      added: number;
      ignored: Array<string>;
      errors: number | null;
    };

/** Where the table came from: a paste, an applied mapping, or a file. */
export type TableSource = 'paste' | 'mapping' | { file: string };

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

function sourceName(source: TableSource, capital: boolean): string {
  if (typeof source !== 'string') {
    return source.file;
  }
  const noun = source === 'paste' ? 'paste' : 'mapped table';
  return `${capital ? 'The' : 'the'} ${noun}`;
}

/** The one sentence the page shows for an outcome. */
export function describeOutcome(
  outcome: TableOutcome,
  source: TableSource,
): string {
  if (outcome.kind === 'held') {
    return `${sourceName(source, true)} needs a column mapping before it enters the draft.`;
  }
  const { added, ignored, errors } = outcome;
  return (
    `Added ${count(added, 'row')} from ${sourceName(source, false)}` +
    (errors === null ? '.' : `; ${count(errors, 'error')} to fix.`) +
    (ignored.length > 0 ? ` Ignored columns: ${ignored.join(', ')}.` : '')
  );
}

type Row = Record<string, unknown>;

/** A saved draft: the grid's rows (with their ids) and which are agent proposed. */
export interface StoredDraft {
  rows: Array<{ id: string } & Row>;
  agentProposed: Array<string>;
}

/** Where the draft is kept between visits (localStorage on the page). */
export interface InviteDraftStore {
  restored: StoredDraft | null;
  save(rows: Array<Row>, agentProposed: Array<string>): void;
}

export function createInviteDraft(
  grid: () => GridApi | null,
  {
    existingEmails,
    store,
  }: { existingEmails: ReadonlySet<string>; store?: InviteDraftStore },
) {
  let pending = store?.restored ?? null;
  const agentProposed = new Set<string>();
  let checked = checkReadyRows([], existingEmails, agentProposed);
  const held: ShallowRef<HeldTable | null> = shallowRef(null);

  const api = (): GridApi => {
    const g = grid();
    if (!g) {
      throw new Error('Invite grid is not ready');
    }
    return g;
  };
  const rowById = (id: string) =>
    api()
      .getRows()
      .find((r) => r.id === id);

  function check(): Array<GridSaveError> {
    const g = grid();
    if (!g) {
      return checked.errors;
    }
    checked = checkReadyRows(g.getRows(), existingEmails, agentProposed);
    g.showErrors(checked.errors);
    store?.save(g.getRows(), [...agentProposed]);
    return checked.errors;
  }

  function status(row: Row): InviteRowStatus {
    return checked.statusOf(String(row.id));
  }

  function rows(): Array<DraftRowView> {
    return api()
      .getRows()
      .map((row) => ({
        id: row.id,
        ...draftFields(row),
        status: status(row),
      }));
  }

  /** The agent appends rows. */
  function add(newRows: Array<Row>): Array<string> {
    const ids = api().addRows(newRows);
    check();
    return ids;
  }

  /** The agent patches rows; resolving a needs-review row makes it agent proposed. */
  function update(patches: Array<{ id: string } & Row>): {
    updated: Array<string>;
    missing: Array<string>;
  } {
    const wasReview = new Set(
      patches.flatMap((p) => {
        const row = rowById(p.id);
        return row !== undefined && needsReview(row) ? [p.id] : [];
      }),
    );
    const result = api().updateRows(patches);
    for (const id of result.updated) {
      if (wasReview.has(id) && !needsReview(rowById(id) ?? {})) {
        agentProposed.add(id);
      }
    }
    check();
    return result;
  }

  /** The agent deletes rows; it may not delete a row that waits on a person. */
  function remove(ids: Array<string>): {
    deleted: Array<string>;
    missing: Array<string>;
  } {
    // Either kind of row waits on a person; deleting it would let an agent
    // replace it with an unmarked copy.
    const refused = ids.filter((id) => {
      const row = rowById(id);
      return row !== undefined && (needsReview(row) || agentProposed.has(id));
    });
    if (refused.length > 0) {
      throw new Error(
        `Rows that need review or are agent proposed cannot be deleted by an agent: ${refused.join(', ')}. Split needs-review rows with update_rows; leave agent-proposed rows for the user to confirm or delete. Nothing was deleted.`,
      );
    }
    const result = api().deleteRows(ids);
    for (const id of result.deleted) {
      agentProposed.delete(id);
    }
    check();
    return result;
  }

  /** A person accepts an agent-proposed row as it is. */
  function confirm(id: string) {
    agentProposed.delete(id);
    check();
  }

  /** A person changed these rows directly in the grid (paste, edit, add, delete). */
  function edited(ids: Array<string>) {
    for (const id of ids) {
      agentProposed.delete(id);
    }
    check();
  }

  /**
   * The grid is ready: bring back the stored draft, once. The rows enter the
   * grid as new (so they count as unsent and Send stays available) and get
   * fresh ids; rows that were agent proposed stay agent proposed.
   */
  function resume() {
    if (!pending) {
      return;
    }
    const { rows: saved, agentProposed: proposed } = pending;
    pending = null;
    const ids = api().addRows(saved);
    const wasProposed = new Set(proposed);
    saved.forEach((row, i) => {
      if (wasProposed.has(row.id)) {
        agentProposed.add(ids[i]);
      }
    });
    check();
  }

  function hold({ table, mapping, problems }: TableMapping): TableOutcome {
    held.value = { table, mapping, problems, agentColumns: [] };
    return { kind: 'held' };
  }

  /** A person's table enters the draft as one undo step. */
  function insert(newRows: Array<Row>, ignored: Array<string>): TableOutcome {
    api().importRows(newRows);
    return {
      kind: 'added',
      added: newRows.length,
      ignored,
      errors: checked.errors.length,
    };
  }

  /**
   * A person pasted text into the grid. Returns the rows for the grid to
   * insert (empty when the paste is held as an unmapped table) and the
   * outcome. `positional` is the grid's default parse.
   */
  function paste(
    text: string,
    { autoMatch }: { autoMatch: boolean },
    positional: () => Array<Row>,
  ): { rows: Array<Row>; outcome: TableOutcome } {
    const plan = planPaste(text, { autoMatch });
    if (plan.kind === 'hold') {
      return { rows: [], outcome: hold(plan) };
    }
    const {
      rows: pasted,
      ignored,
    }: { rows: Array<Row>; ignored: Array<string> } =
      plan.kind === 'insert' ? plan : { rows: positional(), ignored: [] };
    // The grid writes the rows after this returns: their errors are not known yet.
    return {
      rows: pasted,
      outcome: { kind: 'added', added: pasted.length, ignored, errors: null },
    };
  }

  /** A person imports a table (an Excel file): it enters the draft, or is held. */
  function importTable(
    table: UnmappedTable,
    { autoMatch }: { autoMatch: boolean },
  ): TableOutcome {
    const plan = planTable(table, { autoMatch });
    return plan.kind === 'hold' ? hold(plan) : insert(plan.rows, plan.ignored);
  }

  function heldOrThrow(): HeldTable {
    if (!held.value) {
      throw new Error('There is no table waiting for a column mapping.');
    }
    return held.value;
  }

  /** The agent fills the mapping panel; nothing enters the draft. */
  function proposeMapping(mapping: Array<unknown>): Array<string> {
    const { table } = heldOrThrow();
    if (mapping.length !== table.headers.length) {
      throw new Error(
        `The held table has ${table.headers.length} columns; send one entry per column.`,
      );
    }
    const unknown = mapping.find(
      (f) => f !== null && !(INVITE_FIELDS as Array<unknown>).includes(f),
    );
    if (unknown !== undefined) {
      throw new Error(`Unknown template column "${String(unknown)}".`);
    }
    const proposed = mapping as ColumnMapping;
    const next: HeldTable = {
      ...tableMapping(table, proposed),
      agentColumns: proposed.map((_, i) => i),
    };
    held.value = next;
    return next.problems;
  }

  /** A person picks the template column for one column of the held table. */
  function setMappingColumn(column: number, field: InviteField | null) {
    const current = heldOrThrow();
    const mapping = [...current.mapping];
    mapping[column] = field;
    held.value = {
      ...tableMapping(current.table, mapping),
      agentColumns: current.agentColumns.filter((c) => c !== column),
    };
  }

  /** A person applies the mapping: the held table's rows enter the draft. */
  function applyMapping(): TableOutcome {
    const { table, mapping, problems } = heldOrThrow();
    if (problems.length > 0) {
      throw new Error(problems.join('; '));
    }
    const { rows: mapped, ignored } = applyColumnMapping(table, mapping);
    held.value = null;
    return insert(mapped, ignored);
  }

  function discardMapping() {
    held.value = null;
  }

  /** Send gate: every row must be ready. Nothing is sent (prototype). */
  function send(): GridSaveResponse {
    const blocking = check();
    const count = grid()?.getRows().length ?? 0;
    return blocking.length > 0
      ? { errors: blocking, saved: 0 }
      : { errors: [], saved: count };
  }

  return {
    held,
    errors: () => checked.errors,
    status,
    rows,
    check,
    add,
    update,
    remove,
    confirm,
    edited,
    resume,
    paste,
    importTable,
    proposeMapping,
    setMappingColumn,
    applyMapping,
    discardMapping,
    send,
  };
}

export type InviteDraft = ReturnType<typeof createInviteDraft>;
