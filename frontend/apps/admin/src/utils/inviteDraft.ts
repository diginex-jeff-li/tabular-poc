import { INVITE_FIELDS } from 'contracts';
import {
  applyColumnMapping,
  mappingProblems,
  planPaste,
} from 'utils/columnMapping';
import {
  draftFields,
  inviteRowStatus,
  needsReview,
  normalizeInviteRow,
} from 'utils/draftRow';
import { validateInvites } from 'utils/validateInvites';
import { shallowRef } from 'vue';
import type { InviteField } from 'contracts';
import type { ColumnMapping, UnmappedTable } from 'utils/columnMapping';
import type { InviteRowStatus } from 'utils/draftRow';
import type { GridApi, GridSaveError, GridSaveResponse } from 'utils/gridApi';
import type { ShallowRef } from 'vue';

/**
 * PROTOTYPE — the invite draft (CONTEXT.md): every rule about who may change
 * which rows, behind one interface. The page and the agent tools are thin
 * adapters over it; rows themselves live behind the `GridApi` seam
 * (the TanStack `DataGrid` or the Tabulator grid on the page, in memory in
 * tests).
 *
 * Rules it owns:
 * - every write is normalized and followed by a full check and repaint
 * - an agent resolving a needs-review row makes it agent proposed; a person
 *   confirming or editing the row clears that
 * - an agent cannot delete a row that needs review or is agent proposed
 * - a paste whose columns don't match is held as an unmapped table; the
 *   agent may propose a column mapping, only a person applies it
 * - Send passes only when every row is ready
 */
export type Actor = 'person' | 'agent';

export type DraftRowView = { id: string } & Record<
  InviteField,
  string | null
> & { status: InviteRowStatus };

export interface HeldPaste {
  table: UnmappedTable;
  mapping: ColumnMapping;
  /** Columns whose mapping the agent proposed and no person has changed. */
  agentColumns: Array<number>;
}

type Row = Record<string, unknown>;

export function createInviteDraft(
  grid: () => GridApi | null,
  { existingEmails }: { existingEmails: ReadonlySet<string> },
) {
  const agentProposed = new Set<string>();
  let errors: Array<GridSaveError> = [];
  const held: ShallowRef<HeldPaste | null> = shallowRef(null);

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
      return errors;
    }
    errors = validateInvites(g.getRows(), existingEmails, agentProposed);
    g.showErrors(errors);
    return errors;
  }

  function status(row: Row): InviteRowStatus {
    return inviteRowStatus(row, errors, agentProposed);
  }

  function rows(): Array<DraftRowView> {
    return api()
      .getRows()
      .map((row) => ({
        id: String(row.id),
        ...draftFields(row),
        status: status(row),
      }));
  }

  // Who added rows changes no rule today; the actor stays in the interface so
  // every write names it (agreed design, spec decision Q31).
  async function add(newRows: Array<Row>, _by: Actor): Promise<Array<string>> {
    const ids = await api().addRows(newRows.map(normalizeInviteRow));
    check();
    return ids;
  }

  /**
   * Brings back a saved draft. The rows enter the grid as new (so they count
   * as unsent and Send stays available) and get fresh ids; rows that were
   * agent proposed stay agent proposed, so they still need a person's Confirm.
   */
  async function restore(
    saved: Array<{ id: string } & Row>,
    proposed: Array<string>,
  ): Promise<void> {
    const ids = await api().addRows(saved);
    const wasProposed = new Set(proposed);
    saved.forEach((row, i) => {
      if (wasProposed.has(row.id)) {
        agentProposed.add(ids[i]);
      }
    });
    check();
  }

  async function update(
    patches: Array<{ id: string } & Row>,
    by: Actor,
  ): Promise<{ updated: Array<string>; missing: Array<string> }> {
    const wasReview = new Set(
      patches.flatMap((p) => {
        const row = rowById(p.id);
        return row !== undefined && needsReview(row) ? [p.id] : [];
      }),
    );
    const merged = patches.map(({ id, ...fields }) => {
      const current = rowById(id);
      return current
        ? { ...normalizeInviteRow({ ...current, ...fields }), id }
        : { id, ...fields };
    });
    const result = await api().updateRows(merged);
    for (const id of result.updated) {
      if (by === 'person') {
        agentProposed.delete(id);
      } else if (wasReview.has(id) && !needsReview(rowById(id) ?? {})) {
        agentProposed.add(id);
      }
    }
    check();
    return result;
  }

  function remove(
    ids: Array<string>,
    by: Actor,
  ): { deleted: Array<string>; missing: Array<string> } {
    if (by === 'agent') {
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
   * A person pasted text into the grid. Returns the rows to insert now
   * (empty when the paste is held as an unmapped table) and the pasted
   * columns that were ignored. `positional` is the grid's default parse.
   */
  function paste(
    text: string,
    { autoMatch }: { autoMatch: boolean },
    positional: () => Array<Row>,
  ): { rows: Array<Row>; ignored: Array<string> } {
    const plan = planPaste(text, { autoMatch });
    if (plan.kind === 'positional') {
      return { rows: positional(), ignored: [] };
    }
    if (plan.kind === 'insert') {
      return { rows: plan.rows, ignored: plan.ignored };
    }
    held.value = { table: plan.table, mapping: plan.mapping, agentColumns: [] };
    return { rows: [], ignored: [] };
  }

  function heldOrThrow(): HeldPaste {
    if (!held.value) {
      throw new Error('There is no pasted table waiting for a column mapping.');
    }
    return held.value;
  }

  /** The agent fills the mapping panel; nothing enters the draft. */
  function proposeMapping(mapping: Array<unknown>): Array<string> {
    const { table } = heldOrThrow();
    if (mapping.length !== table.headers.length) {
      throw new Error(
        `The pasted table has ${table.headers.length} columns; send one entry per column.`,
      );
    }
    const unknown = mapping.find(
      (f) => f !== null && !(INVITE_FIELDS as Array<unknown>).includes(f),
    );
    if (unknown !== undefined) {
      throw new Error(`Unknown template column "${String(unknown)}".`);
    }
    const proposed = mapping as ColumnMapping;
    held.value = {
      table,
      mapping: proposed,
      agentColumns: proposed.map((_, i) => i),
    };
    return mappingProblems(proposed);
  }

  /** A person picks the template column for one pasted column. */
  function setMappingColumn(column: number, field: InviteField | null) {
    const current = heldOrThrow();
    const mapping = [...current.mapping];
    mapping[column] = field;
    held.value = {
      ...current,
      mapping,
      agentColumns: current.agentColumns.filter((c) => c !== column),
    };
  }

  /** A person applies the mapping: the pasted rows enter the draft. */
  async function applyMapping(): Promise<{
    added: number;
    ignored: Array<string>;
  }> {
    const { table, mapping } = heldOrThrow();
    const problems = mappingProblems(mapping);
    if (problems.length > 0) {
      throw new Error(problems.join('; '));
    }
    const { rows: mapped, ignored } = applyColumnMapping(table, mapping);
    held.value = null;
    await add(mapped, 'person');
    return { added: mapped.length, ignored };
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
    errors: () => errors,
    /** Ids of rows still waiting for a person to confirm the agent's change. */
    agentProposedIds: () => [...agentProposed],
    status,
    rows,
    check,
    add,
    restore,
    update,
    remove,
    confirm,
    edited,
    paste,
    proposeMapping,
    setMappingColumn,
    applyMapping,
    discardMapping,
    send,
  };
}

export type InviteDraft = ReturnType<typeof createInviteDraft>;
