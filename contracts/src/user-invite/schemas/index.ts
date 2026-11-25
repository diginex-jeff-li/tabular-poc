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
export function parseInviteGroups(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(';')
    .map((g) => g.trim())
    .filter(Boolean);
}

export const InviteRowSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: InviteRoleEnum,
  groups: z.string().nullable(),
});

export type InviteRowType = z.infer<typeof InviteRowSchema>;

/**
 * A row of the invite draft: the template's columns, any text in each.
 * Agent tools and grid writes accept this; only Send enforces
 * `InviteRowSchema` (docs/adr/0001-draft-rows-vs-ready-rows.md).
 */
export const InviteDraftRowSchema = z
  .object({
    id: z.string(),
    email: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    role: z.string().nullable(),
    groups: z.string().nullable(),
  })
  .strict();
