import {
  INVITE_COLUMNS,
  INVITE_GROUPS,
  INVITE_NAME_LENGTH,
  INVITE_ROLES,
  InviteDraftRowSchema,
} from 'contracts';
import {
  mappingProblems,
  type ColumnMapping,
  type UnmappedTable,
} from 'utils/columnMapping';
import {
  draftFields,
  INVITE_ROW_STATUSES,
  inviteRowStatus,
  needsReview,
} from 'utils/inviteDraft';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { GridApi, GridSaveError } from 'composables/useGridEditor';

/**
 * PROTOTYPE — agent tools for the bulk invite grid (SC15-706).
 *
 * Plain objects in the WebMCP `registerTool` shape. The same handlers back
 * both the native WebMCP registration and the `window.scInvite` bridge.
 *
 * Tools read and write draft rows (`InviteDraftRowSchema`): the template's
 * columns, any text in each. Allowed roles and groups are hints in the schema
 * descriptions, not limits — validity is `validate`'s job, so the agent can
 * always write a value a person then fixes
 * (docs/adr/0001-draft-rows-vs-ready-rows.md). Every JSON Schema is generated
 * from Zod. `outputSchema` is set on `read_rows` and the three row-changing
 * tools, which all return row ids an agent chains on.
 *
 * Safety rules:
 * - Tools only edit the draft. There is no tool that sends invites,
 *   confirms a row or applies a column mapping — those stay human clicks.
 * - Resolving a needs-review row through `update_rows` marks it agent
 *   proposed, which blocks Send until a person confirms or edits it.
 * - `delete_rows` refuses needs-review rows, so the agent cannot swap one
 *   for a clean copy and hide the original.
 * - `propose_column_mapping` only fills the page's mapping panel; a person
 *   applies it, and only then do the pasted rows enter the draft.
 */
export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations: { readOnlyHint: boolean };
  execute(args: Record<string, unknown>): Promise<unknown>;
}

interface InviteToolDeps {
  grid: () => GridApi | null;
  /** Runs the same checks as Send over every row. */
  validate: (rows: Record<string, unknown>[]) => GridSaveError[];
  /** Row ids the agent resolved from needs review; owned by the page. */
  agentProposed: Set<string>;
  /** The page's held paste, if any (see CONTEXT.md "Unmapped table"). */
  unmappedTable: {
    current(): { table: UnmappedTable; mapping: ColumnMapping } | null;
    propose(mapping: ColumnMapping): void;
  };
}

const SAMPLE_ROWS = 5;
const FIELDS = INVITE_COLUMNS.map((c) => c.field);

function createUnmappedTableTools(
  unmappedTable: InviteToolDeps['unmappedTable'],
): AgentTool[] {
  const held = () => {
    const current = unmappedTable.current();
    if (!current)
      throw new Error('There is no pasted table waiting for a column mapping.');
    return current;
  };
  return [
    {
      name: 'read_pasted_table',
      description:
        'When the user pasted a table whose columns did not match the template, return its headers, up to 5 sample rows, the current column mapping and what is still missing. Nothing is in the draft until the user applies a mapping.',
      inputSchema: jsonSchema(NoInputSchema),
      annotations: { readOnlyHint: true },
      execute: async () => {
        const current = unmappedTable.current();
        if (!current) return { pending: false };
        return {
          pending: true,
          headers: current.table.headers,
          sampleRows: current.table.rows.slice(0, SAMPLE_ROWS),
          rowCount: current.table.rows.length,
          mapping: current.mapping,
          problems: mappingProblems(current.mapping),
          templateColumns: INVITE_COLUMNS,
        };
      },
    },
    {
      name: 'propose_column_mapping',
      description:
        'Propose which template column each pasted column fills: one entry per pasted column, in order, a template field or null to ignore the column. The user reviews and applies it; this tool does not add rows.',
      inputSchema: jsonSchema(
        z
          .object({
            mapping: z.array(
              z.enum(FIELDS as [string, ...string[]]).nullable(),
            ),
          })
          .strict(),
      ),
      annotations: { readOnlyHint: false },
      execute: async (args) => {
        const { table } = held();
        const mapping = requireArray(args, 'mapping');
        if (mapping.length !== table.headers.length) {
          throw new Error(
            `The pasted table has ${table.headers.length} columns; send one entry per column.`,
          );
        }
        const unknown = mapping.find(
          (f) => f !== null && !(FIELDS as unknown[]).includes(f),
        );
        if (unknown !== undefined) {
          throw new Error(`Unknown template column "${String(unknown)}".`);
        }
        unmappedTable.propose(mapping as ColumnMapping);
        return {
          mapping,
          problems: mappingProblems(mapping as ColumnMapping),
          applied: false,
        };
      },
    },
  ];
}

// ── Input: a draft row minus the grid-owned id ──
const AgentDraftRowSchema = InviteDraftRowSchema.omit({ id: true })
  .extend({
    role: z
      .string()
      .nullable()
      .describe(`Role name, one of: ${INVITE_ROLES.join(', ')}`),
    groups: z
      .string()
      .nullable()
      .describe(
        `Group names separated by "; ", each one of: ${INVITE_GROUPS.join(', ')}`,
      ),
  })
  .partial()
  .strict();
const AgentRowPatchSchema = AgentDraftRowSchema.extend({
  id: z.string(),
}).strict();
const NoInputSchema = z.object({}).strict();

// ── Output: draft rows as they sit in the grid, with their status ──
const ToolErrorSchema = z
  .object({ id: z.string(), field: z.string(), message: z.string() })
  .strict();
const CheckResultSchema = z.object({
  totalErrors: z.number().int(),
  errors: z.array(ToolErrorSchema),
});
const GridRowOutputSchema = InviteDraftRowSchema.extend({
  status: z.enum(INVITE_ROW_STATUSES),
}).strict();
export const ReadRowsOutputSchema = CheckResultSchema.extend({
  rows: z.array(GridRowOutputSchema),
}).strict();
export const AddRowsOutputSchema = CheckResultSchema.extend({
  added: z.array(z.string()),
}).strict();
export const UpdateRowsOutputSchema = CheckResultSchema.extend({
  updated: z.array(z.string()),
  missingIds: z.array(z.string()),
}).strict();
export const DeleteRowsOutputSchema = CheckResultSchema.extend({
  deleted: z.array(z.string()),
  missingIds: z.array(z.string()),
}).strict();

type CheckResult = z.infer<typeof CheckResultSchema>;

function jsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const { $schema: _draft, ...rest } = zodToJsonSchema(schema, {
    $refStrategy: 'none',
  }) as Record<string, unknown>;
  return rest;
}

const ROW_FIELDS = Object.keys(AgentDraftRowSchema.shape);

// Agent → grid: keep known fields only; the grid normalizes what lands.
function toGridRow(raw: unknown): Record<string, unknown> {
  const source =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    ROW_FIELDS.filter((f) => f in source).map((f) => [f, source[f]]),
  );
}

function requireArray(args: Record<string, unknown>, key: string): unknown[] {
  const value = args[key];
  if (!Array.isArray(value)) throw new Error(`"${key}" must be an array`);
  return value;
}

export function createInviteTools({
  grid,
  validate,
  agentProposed,
  unmappedTable,
}: InviteToolDeps): AgentTool[] {
  const api = (): GridApi => {
    const g = grid();
    if (!g) throw new Error('Invite grid is not ready');
    return g;
  };
  const rowById = (id: string) =>
    api()
      .getRows()
      .find((r) => r.id === id);
  let lastErrors: GridSaveError[] = [];

  // Validate the whole invite draft (duplicates span rows), paint it on the grid,
  // and report errors by row id.
  const check = (ids?: string[]): CheckResult => {
    lastErrors = validate(api().getRows());
    api().showErrors(lastErrors);
    const scoped = ids
      ? lastErrors.filter((e) => ids.includes(e.rowId))
      : lastErrors;
    return {
      totalErrors: lastErrors.length,
      errors: scoped.map(({ rowId, field, message }) => ({
        id: rowId,
        field,
        message,
      })),
    };
  };

  const toAgentRow = (row: Record<string, unknown>) => ({
    id: String(row.id),
    ...draftFields(row),
    status: inviteRowStatus(row, lastErrors, agentProposed),
  });

  return [
    {
      name: 'get_invite_form',
      description:
        'Describe the bulk-invite grid: the row schema, the allowed roles and groups, row statuses and the current row count. Call this first.',
      inputSchema: jsonSchema(NoInputSchema),
      annotations: { readOnlyHint: true },
      execute: async () => ({
        rowSchema: jsonSchema(AgentDraftRowSchema),
        roles: INVITE_ROLES,
        groups: INVITE_GROUPS,
        rules: [
          'Email must be a valid address, unique within the grid (case-insensitive), and not belong to an existing user',
          `First and last name: ${INVITE_NAME_LENGTH.min}-${INVITE_NAME_LENGTH.max} characters`,
          'Values are trimmed and role/group names matched case-insensitively when written',
        ],
        statuses: {
          Ready: 'Passes every send check',
          'Not ready':
            'Columns are clear but a value fails a check; see errors',
          'Needs review':
            'A whole line in one cell that could not be split without guessing. Split it with update_rows; you cannot delete it',
          'Agent proposed':
            'You resolved a needs-review row; the user must confirm it before sending, and you cannot delete it',
        },
        rowCount: api().getRows().length,
        sending:
          'Tools only edit the draft. The user reviews and clicks "Send invites".',
      }),
    },
    {
      name: 'read_rows',
      description:
        'Return every row with its id and status, and the current validation errors.',
      inputSchema: jsonSchema(NoInputSchema),
      outputSchema: jsonSchema(ReadRowsOutputSchema),
      annotations: { readOnlyHint: true },
      execute: async () => {
        const result = check();
        return {
          rows: api().getRows().map(toAgentRow),
          ...result,
        } satisfies z.infer<typeof ReadRowsOutputSchema>;
      },
    },
    {
      name: 'add_rows',
      description:
        'Append people to invite. Any text is accepted; returns the new row ids and any validation errors on them.',
      inputSchema: jsonSchema(
        z.object({ rows: z.array(AgentDraftRowSchema).max(200) }).strict(),
      ),
      outputSchema: jsonSchema(AddRowsOutputSchema),
      annotations: { readOnlyHint: false },
      execute: async (args) => {
        const added = await api().addRows(
          requireArray(args, 'rows').map(toGridRow),
        );
        return { added, ...check(added) } satisfies z.infer<
          typeof AddRowsOutputSchema
        >;
      },
    },
    {
      name: 'update_rows',
      description:
        'Change fields on existing rows by id (use read_rows for ids). Only the given fields change; set the others to null to clear them. Resolving a "Needs review" row marks it "Agent proposed" for the user to confirm. Returns updated ids, unknown ids and errors on the updated rows.',
      inputSchema: jsonSchema(
        z.object({ rows: z.array(AgentRowPatchSchema) }).strict(),
      ),
      outputSchema: jsonSchema(UpdateRowsOutputSchema),
      annotations: { readOnlyHint: false },
      execute: async (args) => {
        const patches = requireArray(args, 'rows').map((r) => ({
          id: String((r as Record<string, unknown>)?.id ?? ''),
          ...toGridRow(r),
        }));
        const wasReview = patches
          .map((p) => p.id)
          .filter((id) => {
            const row = rowById(id);
            return row !== undefined && needsReview(row);
          });
        const { updated, missing } = await api().updateRows(patches);
        for (const id of wasReview) {
          const row = rowById(id);
          if (row && !needsReview(row)) agentProposed.add(id);
        }
        return {
          updated,
          missingIds: missing,
          ...check(updated),
        } satisfies z.infer<typeof UpdateRowsOutputSchema>;
      },
    },
    {
      name: 'delete_rows',
      description:
        'Remove rows by id from the draft. Rows that need review or are agent proposed cannot be deleted. Returns deleted ids, unknown ids and all remaining errors.',
      inputSchema: jsonSchema(z.object({ ids: z.array(z.string()) }).strict()),
      outputSchema: jsonSchema(DeleteRowsOutputSchema),
      annotations: { readOnlyHint: false },
      execute: async (args) => {
        const ids = requireArray(args, 'ids').map(String);
        // Either kind of row is waiting on a person; deleting it would let an
        // agent replace it with an unmarked copy.
        const refused = ids.filter((id) => {
          const row = rowById(id);
          return (
            row !== undefined && (needsReview(row) || agentProposed.has(id))
          );
        });
        if (refused.length > 0) {
          throw new Error(
            `Rows that need review or are agent proposed cannot be deleted by an agent: ${refused.join(', ')}. Split needs-review rows with update_rows; leave agent-proposed rows for the user to confirm or delete. Nothing was deleted.`,
          );
        }
        const { deleted, missing } = api().deleteRows(ids);
        return { deleted, missingIds: missing, ...check() } satisfies z.infer<
          typeof DeleteRowsOutputSchema
        >;
      },
    },
    {
      name: 'validate',
      description:
        'Run the same checks as "Send invites" on every row, highlight problems in the grid and return them.',
      inputSchema: jsonSchema(NoInputSchema),
      annotations: { readOnlyHint: true },
      execute: async () => check(),
    },
    ...createUnmappedTableTools(unmappedTable),
  ];
}
