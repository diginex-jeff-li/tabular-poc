import { INVITE_GROUPS, InviteRowSchema, parseInviteGroups } from 'contracts';
import { needsReview } from 'utils/draftRow';
import type { GridSaveError } from 'composables/useGridEditor';

const ALLOWED_GROUPS: ReadonlySet<string> = new Set(INVITE_GROUPS);

/**
 * PROTOTYPE — the "server" check for bulk invite (SC15-706).
 *
 * One function serves the Send button and the agent `validate` tool, so a
 * human and an agent always see the same errors. A row is ready only when
 * none of these apply:
 * - needs review: a whole line in one cell that cannot be split without
 *   guessing (reported once, instead of field errors)
 * - agent proposed: the agent resolved a needs-review row and no person has
 *   confirmed or edited it yet (`agentProposed`, owned by the invite draft module)
 * - the row fails `InviteRowSchema` (email format, names, role list)
 * - a name in the "; "-separated groups cell is not in the group list
 * - an email repeated within the invite draft (case-insensitive)
 * - an email that already belongs to a user in the organisation
 *
 * Values are trimmed first, as a spreadsheet import would. Errors carry
 * `rowId` so the grid highlights the right row whatever its position after
 * sorting or filtering.
 */
export function validateInvites(
  rows: Record<string, unknown>[],
  existingEmails: ReadonlySet<string>,
  agentProposed: ReadonlySet<string> = new Set(),
): GridSaveError[] {
  const errors: GridSaveError[] = [];
  const firstRowByEmail = new Map<string, number>();

  rows.forEach((raw, row) => {
    const rowId = String(raw.id ?? '');
    if (needsReview(raw)) {
      const field =
        Object.keys(raw).find((k) => k !== 'id' && raw[k] != null) ?? 'email';
      errors.push({
        row,
        rowId,
        field,
        message:
          'Needs review: this text could not be split into columns without guessing',
      });
      return;
    }
    if (agentProposed.has(rowId)) {
      errors.push({
        row,
        rowId,
        field: 'status',
        message: 'Agent proposed: confirm or edit this row before sending',
      });
    }
    const trimmed = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [
        k,
        typeof v === 'string' ? v.trim() : v,
      ]),
    );
    const candidate: Record<string, unknown> = {
      ...trimmed,
      groups:
        trimmed.groups === '' || trimmed.groups === undefined
          ? null
          : trimmed.groups,
    };
    const result = InviteRowSchema.safeParse(candidate);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          row,
          rowId,
          field: String(issue.path[0] ?? '?'),
          message: issue.message,
        });
      }
    }
    const unknownGroups = parseInviteGroups(candidate.groups).filter(
      (g) => !ALLOWED_GROUPS.has(g),
    );
    if (unknownGroups.length > 0) {
      errors.push({
        row,
        rowId,
        field: 'groups',
        message: `Unknown group(s): ${unknownGroups.join(', ')}`,
      });
    }

    const email =
      typeof candidate.email === 'string' ? candidate.email.toLowerCase() : '';
    if (!email) return;
    if (existingEmails.has(email)) {
      errors.push({
        row,
        rowId,
        field: 'email',
        message: `${email} already has an account`,
      });
    }
    const first = firstRowByEmail.get(email);
    if (first === undefined) {
      firstRowByEmail.set(email, row);
    } else {
      errors.push({
        row,
        rowId,
        field: 'email',
        message: `Duplicate of row ${first + 1}`,
      });
    }
  });

  return errors;
}
