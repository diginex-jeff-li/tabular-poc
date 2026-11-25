import { InviteGroupEnum, InviteRowSchema, parseInviteGroups } from 'contracts';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { GridApi, GridSaveError } from 'composables/useGridEditor';

/**
 * PROTOTYPE — agent tools for the bulk invite grid (SC15-706).
 *
 * Plain objects in the WebMCP `registerTool` shape. The same handlers back
 * both the native WebMCP registration and the `window.scInvite` bridge.
 *
 * Every JSON Schema is generated from Zod, and the row shape from the shared
 * `InviteRowSchema` contract, so the agent sees the same required fields,
 * email format, lengths and role/group lists as the grid and the validator.
 * `outputSchema` is set on `read_rows` and on the three row-changing tools,
 * which all return row ids an agent chains on. `get_invite_form` and
 * `validate` have none.
 *
 * Safety rule: tools only edit the grid draft. There is deliberately no tool
 * that sends invites — that stays a human click on "Send invites".
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
}

// ── Input: the contract row minus the grid-owned id, groups as a list ──
const AgentInviteRowSchema = InviteRowSchema.omit({
  id: true,
  groups: true,
})
  .extend({ groups: z.array(InviteGroupEnum).optional() })
  .strict();
const AgentRowPatchSchema = AgentInviteRowSchema.partial()
  .extend({ id: z.string() })
  .strict();
const NoInputSchema = z.object({}).strict();

// ── Output: rows as they sit in the grid. Values are plain strings because a
// row may still hold an invalid email or role; its errors say why. ──
const ToolErrorSchema = z
  .object({ id: z.string(), field: z.string(), message: z.string() })
  .strict();
const CheckResultSchema = z.object({
  totalErrors: z.number().int(),
  errors: z.array(ToolErrorSchema),
});
const GridRowOutputSchema = z
  .object({
    id: z.string(),
    email: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    role: z.string().nullable(),
    groups: z.array(z.string()),
  })
  .strict();
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
type GridRowOutput = z.infer<typeof GridRowOutputSchema>;

function jsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const { $schema: _draft, ...rest } = zodToJsonSchema(schema, {
    $refStrategy: 'none',
  }) as Record<string, unknown>;
  return rest;
}

const ROW_FIELDS = Object.keys(AgentInviteRowSchema.shape);

// Agent → grid: keep known fields; the grid stores groups as one "; " cell.
function toGridRow(raw: unknown): Record<string, unknown> {
  const source =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const row = Object.fromEntries(
    ROW_FIELDS.filter((f) => f in source).map((f) => [f, source[f]]),
  );
  if (Array.isArray(row.groups)) row.groups = row.groups.join('; ');
  return row;
}

// Grid → agent: every field present, blank as null, groups as a list.
function toAgentRow(row: Record<string, unknown>): GridRowOutput {
  const text = (v: unknown) =>
    v === undefined || v === null || v === '' ? null : String(v);
  return {
    id: String(row.id),
    email: text(row.email),
    firstName: text(row.firstName),
    lastName: text(row.lastName),
    role: text(row.role),
    groups: parseInviteGroups(row.groups),
  };
}

function requireArray(args: Record<string, unknown>, key: string): unknown[] {
  const value = args[key];
  if (!Array.isArray(value)) throw new Error(`"${key}" must be an array`);
  return value;
}

export function createInviteTools({
  grid,
  validate,
}: InviteToolDeps): AgentTool[] {
  const api = (): GridApi => {
    const g = grid();
    if (!g) throw new Error('Invite grid is not ready');
    return g;
  };

  // Validate the whole batch (duplicates span rows), paint it on the grid,
  // and report errors by row id.
  const check = (ids?: string[]): CheckResult => {
    const errors = validate(api().getRows());
    api().showErrors(errors);
    const scoped = ids ? errors.filter((e) => ids.includes(e.rowId)) : errors;
    return {
      totalErrors: errors.length,
      errors: scoped.map(({ rowId, field, message }) => ({
        id: rowId,
        field,
        message,
      })),
    };
  };

  return [
    {
      name: 'get_invite_form',
      description:
        'Describe the bulk-invite grid: the row schema, rules that need other rows or the user directory, and the current row count. Call this first.',
      inputSchema: jsonSchema(NoInputSchema),
      annotations: { readOnlyHint: true },
      execute: async () => ({
        rowSchema: jsonSchema(AgentInviteRowSchema),
        rules: [
          'Email must be unique within the grid (case-insensitive)',
          'Email must not belong to an existing user',
        ],
        rowCount: api().getRows().length,
        sending:
          'Tools only edit the draft. The user reviews and clicks "Send invites".',
      }),
    },
    {
      name: 'read_rows',
      description:
        'Return every row (with its id) and the current validation errors.',
      inputSchema: jsonSchema(NoInputSchema),
      outputSchema: jsonSchema(ReadRowsOutputSchema),
      annotations: { readOnlyHint: true },
      execute: async () =>
        ({
          rows: api().getRows().map(toAgentRow),
          ...check(),
        }) satisfies z.infer<typeof ReadRowsOutputSchema>,
    },
    {
      name: 'add_rows',
      description:
        'Append people to invite. Returns the new row ids and any validation errors on them.',
      inputSchema: jsonSchema(
        z.object({ rows: z.array(AgentInviteRowSchema).max(200) }).strict(),
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
        'Change fields on existing rows by id (use read_rows for ids). Only the given fields change. Returns updated ids, unknown ids and errors on the updated rows.',
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
        const { updated, missing } = await api().updateRows(patches);
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
        'Remove rows by id from the draft. Returns deleted ids, unknown ids and all remaining errors.',
      inputSchema: jsonSchema(z.object({ ids: z.array(z.string()) }).strict()),
      outputSchema: jsonSchema(DeleteRowsOutputSchema),
      annotations: { readOnlyHint: false },
      execute: async (args) => {
        const { deleted, missing } = api().deleteRows(
          requireArray(args, 'ids').map(String),
        );
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
  ];
}
