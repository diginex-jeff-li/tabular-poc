import { z } from 'zod';

/**
 * PROTOTYPE — bulk invite of internal users (SC15-706 Scenario A).
 *
 * Mirrors the single-invite contract in sc-shared-contracts
 * (`InviteManagedProfileRequestSchema`, `POST /profiles`) with two
 * deliberate simplifications so one row fits one spreadsheet line:
 * - `role` is a role NAME from a closed list (the real contract takes
 *   `roleId`); names would be resolved to ids at send time.
 * - `groups` is a "; "-separated list of group NAMES (the real contract
 *   takes `groupIds[]`); one spreadsheet cell holds several groups.
 *   `parseInviteGroups` splits it; each name must be in `INVITE_GROUPS`.
 * `grantableRoleIds` is out of scope. SC15-706 does not define its
 * template, so these columns are an assumption.
 */
export const INVITE_ROLES = [
  'Account Admin',
  'Assessment Manager',
  'Responder',
  'Viewer',
] as const;

export const INVITE_GROUPS = [
  'Vietnam Suppliers',
  'Bangladesh Suppliers',
  'Apparel',
  'Electronics',
] as const;

export const InviteRoleEnum = z.enum(INVITE_ROLES);
export const InviteGroupEnum = z.enum(INVITE_GROUPS);

/** Split a "; "-separated groups cell into trimmed, non-empty names. */
export function parseInviteGroups(value: unknown): Array<string> {
  if (typeof value !== 'string') {
    return [];
  }
  return value
    .split(';')
    .map((g) => g.trim())
    .filter(Boolean);
}

/** First and last name length; the Excel template reads it too. */
export const INVITE_NAME_LENGTH = { min: 1, max: 100 } as const;

/**
 * The invite template (CONTEXT.md): one ready row. Its keys give the
 * template's columns and their order; everything below is derived from it.
 */
export const InviteRowSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string().min(INVITE_NAME_LENGTH.min).max(INVITE_NAME_LENGTH.max),
  lastName: z.string().min(INVITE_NAME_LENGTH.min).max(INVITE_NAME_LENGTH.max),
  role: InviteRoleEnum,
  groups: z.string().nullable(),
});

export type InviteRowType = z.infer<typeof InviteRowSchema>;

const { id: _id, ...INVITE_FIELD_SHAPE } = InviteRowSchema.shape;
export type InviteField = keyof typeof INVITE_FIELD_SHAPE;

/** The template's columns, in order. */
export const INVITE_FIELDS = Object.keys(
  INVITE_FIELD_SHAPE,
) as Array<InviteField>;

/**
 * What the schema cannot hold: each column's header, and the other header
 * names client spreadsheets use for it. Paste and Excel import match headers
 * against both, ignoring case, spaces and punctuation. A missing or extra
 * column fails type-checking.
 */
const INVITE_COLUMN_META = {
  email: {
    header: 'Email',
    aliases: ['e-mail', 'email address', 'work email'],
  },
  firstName: { header: 'First Name', aliases: ['given name', 'forename'] },
  lastName: { header: 'Last Name', aliases: ['surname', 'family name'] },
  role: { header: 'Role', aliases: ['access level', 'permission'] },
  groups: { header: 'Groups', aliases: ['group', 'teams'] },
} as const satisfies Record<
  InviteField,
  { header: string; aliases: ReadonlyArray<string> }
>;

export const INVITE_COLUMNS = INVITE_FIELDS.map((field) => ({
  field,
  ...INVITE_COLUMN_META[field],
  required: !INVITE_FIELD_SHAPE[field].isNullable(),
}));

/** Column titles by field, for the grid. */
export const INVITE_TITLES = Object.fromEntries(
  INVITE_COLUMNS.map((c) => [c.field, c.header]),
) as Record<InviteField, string>;

const headerKey = (header: string) =>
  header.toLowerCase().replace(/[^a-z0-9]/g, '');
const FIELD_BY_HEADER_KEY = new Map<string, InviteField>(
  INVITE_COLUMNS.flatMap((c) =>
    [c.header, ...c.aliases].map((h) => [headerKey(h), c.field] as const),
  ),
);

/** The template column a client header names, or null. */
export function matchInviteHeader(header: string): InviteField | null {
  return FIELD_BY_HEADER_KEY.get(headerKey(header)) ?? null;
}

/**
 * A row of the invite draft: the template's columns, any text in each.
 * Derived from `InviteRowSchema`, so it cannot drift from the template.
 * Agent tools and grid writes accept this; only Send enforces
 * `InviteRowSchema` (docs/adr/0001-draft-rows-vs-ready-rows.md).
 */
export const InviteDraftRowSchema = z
  .object({
    id: z.string(),
    ...(Object.fromEntries(
      INVITE_FIELDS.map((field) => [field, z.string().nullable()]),
    ) as Record<InviteField, z.ZodNullable<z.ZodString>>),
  })
  .strict();
