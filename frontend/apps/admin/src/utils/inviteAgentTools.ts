import {
  INVITE_COLUMNS,
  INVITE_FIELDS,
  INVITE_GROUPS,
  INVITE_NAME_LENGTH,
  INVITE_ROLES,
  InviteDraftRowSchema,
} from 'contracts';
import { mappingProblems } from 'utils/columnMapping';
import { INVITE_ROW_STATUSES } from 'utils/draftRow';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { InviteDraft } from 'utils/inviteDraft';

/**
 * PROTOTYPE — agent tools for the bulk invite grid (SC15-706).
 *
 * An adapter: each tool is one call into the invite draft module, which owns
 * every rule (who may change which rows, agent proposed, unmapped tables).
 * This file owns only the tool contract — names, descriptions and JSON
 * Schemas generated from Zod — in the WebMCP `registerTool` shape. The same
 * handlers back the native WebMCP registration and the `window.scInvite`
 * bridge.
 *
 * Tools read and write draft rows (`InviteDraftRowSchema`); allowed roles
 * and groups are hints, not limits (docs/adr/0001-draft-rows-vs-ready-rows.md).
 * There is no tool that sends invites, confirms a row or applies a column
 * mapping — those stay human clicks.
 */
export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations: { readOnlyHint: boolean };
  execute(args: Record<string, unknown>): Promise<unknown>;
}

const SAMPLE_ROWS = 5;

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

// Agent → draft: keep known fields only; the draft normalizes what lands.
function toDraftRow(raw: unknown): Record<string, unknown> {
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

export function createInviteTools(draft: InviteDraft): AgentTool[] {
  // The draft has just checked every row; report errors by row id, scoped
  // to the rows a call touched when given.
  const result = (ids?: string[]): CheckResult => {
    const errors = draft.errors();
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
        rowCount: draft.rows().length,
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
        draft.check();
        return {
          rows: draft.rows(),
          ...result(),
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
        const added = await draft.add(
          requireArray(args, 'rows').map(toDraftRow),
        );
        return { added, ...result(added) } satisfies z.infer<
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
          ...toDraftRow(r),
        }));
        const { updated, missing } = await draft.update(patches, 'agent');
        return {
          updated,
          missingIds: missing,
          ...result(updated),
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
        const { deleted, missing } = draft.remove(
          requireArray(args, 'ids').map(String),
          'agent',
        );
        return { deleted, missingIds: missing, ...result() } satisfies z.infer<
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
      execute: async () => {
        draft.check();
        return result();
      },
    },
    {
      name: 'read_pasted_table',
      description:
        'When the user pasted a table whose columns did not match the template, return its headers, up to 5 sample rows, the current column mapping and what is still missing. Nothing is in the draft until the user applies a mapping.',
      inputSchema: jsonSchema(NoInputSchema),
      annotations: { readOnlyHint: true },
      execute: async () => {
        const held = draft.held.value;
        if (!held) return { pending: false };
        return {
          pending: true,
          headers: held.table.headers,
          sampleRows: held.table.rows.slice(0, SAMPLE_ROWS),
          rowCount: held.table.rows.length,
          mapping: held.mapping,
          problems: mappingProblems(held.mapping),
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
              z.enum(INVITE_FIELDS as [string, ...string[]]).nullable(),
            ),
          })
          .strict(),
      ),
      annotations: { readOnlyHint: false },
      execute: async (args) => {
        const mapping = requireArray(args, 'mapping');
        const problems = draft.proposeMapping(mapping);
        return { mapping, problems, applied: false };
      },
    },
  ];
}
