import { INVITE_GROUPS, InviteRowSchema, parseInviteGroups } from 'contracts';
import { needsReview } from 'utils/draftRow';
import type { GridSaveError } from 'utils/gridApi';

const ALLOWED_GROUPS: ReadonlySet<string> = new Set(INVITE_GROUPS);

export const INVITE_ROW_STATUSES = [
  'Ready',
  'Not ready',
  'Needs review',
  'Agent proposed',
] as const;
export type InviteRowStatus = (typeof INVITE_ROW_STATUSES)[number];

export interface ReadyRowCheck {
  /** Everything that blocks Send; empty when every row is ready. */
  errors: Array<GridSaveError>;
  /** A row id the check did not see has not passed it, so it is not ready. */
  statusOf: (rowId: string) => InviteRowStatus;
}

type Problem = Pick<GridSaveError, 'field' | 'message'>;

const AGENT_PROPOSED: Problem = {
  field: 'status',
  message: 'Agent proposed: confirm or edit this row before sending',
};

/**
 * PROTOTYPE — the "server" check for bulk invite (SC15-706).
 *
 * One check serves the Send button, the grid's status column and the agent
 * `validate` tool, so a human and an agent always see the same errors and
 * statuses. Each row gets the first status that applies:
 * - needs review: a whole line in one cell that cannot be split without
 *   guessing (reported once, instead of field errors)
 * - agent proposed: the agent resolved a needs-review row and no person has
 *   confirmed or edited it yet (`agentProposed`, owned by the invite draft module)
 * - not ready: the row fails `InviteRowSchema` (email format, names, role
 *   list), names a group not in the "; "-separated group list, repeats an
 *   email within the invite draft (case-insensitive), or uses an email that
 *   already belongs to a user in the organisation
 * - ready
 *
 * Values are trimmed first, as a spreadsheet import would. Errors carry
 * `rowId` so the grid highlights the right row whatever its position after
 * sorting or filtering.
 */
export function checkReadyRows(
  rows: ReadonlyArray<Record<string, unknown>>,
  existingEmails: ReadonlySet<string>,
  agentProposed: ReadonlySet<string>,
): ReadyRowCheck {
  const errors: Array<GridSaveError> = [];
  const statuses = new Map<string, InviteRowStatus>();
  const firstRowByEmail = new Map<string, number>();

  function sendProblems(
    raw: Record<string, unknown>,
    row: number,
  ): Array<Problem> {
    const problems: Array<Problem> = [];
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
        problems.push({
          field: String(issue.path[0] ?? '?'),
          message: issue.message,
        });
      }
    }
    const unknownGroups = parseInviteGroups(candidate.groups).filter(
      (g) => !ALLOWED_GROUPS.has(g),
    );
    if (unknownGroups.length > 0) {
      problems.push({
        field: 'groups',
        message: `Unknown group(s): ${unknownGroups.join(', ')}`,
      });
    }

    const email =
      typeof candidate.email === 'string' ? candidate.email.toLowerCase() : '';
    if (!email) {
      return problems;
    }
    if (existingEmails.has(email)) {
      problems.push({
        field: 'email',
        message: `${email} already has an account`,
      });
    }
    const first = firstRowByEmail.get(email);
    if (first === undefined) {
      firstRowByEmail.set(email, row);
    } else {
      problems.push({
        field: 'email',
        message: `Duplicate of row ${first + 1}`,
      });
    }
    return problems;
  }

  function checkRow(
    raw: Record<string, unknown>,
    rowId: string,
    row: number,
  ): { status: InviteRowStatus; problems: Array<Problem> } {
    if (needsReview(raw)) {
      const field =
        Object.keys(raw).find(
          (k) => k !== 'id' && raw[k] !== null && raw[k] !== undefined,
        ) ?? 'email';
      return {
        status: 'Needs review',
        problems: [
          {
            field,
            message:
              'Needs review: this text could not be split into columns without guessing',
          },
        ],
      };
    }
    const problems = sendProblems(raw, row);
    if (agentProposed.has(rowId)) {
      return {
        status: 'Agent proposed',
        problems: [AGENT_PROPOSED, ...problems],
      };
    }
    return { status: problems.length > 0 ? 'Not ready' : 'Ready', problems };
  }

  rows.forEach((raw, row) => {
    const rowId = String(raw.id ?? '');
    const { status, problems } = checkRow(raw, rowId, row);
    statuses.set(rowId, status);
    for (const problem of problems) {
      errors.push({ row, rowId, ...problem });
    }
  });

  return {
    errors,
    statusOf: (rowId) => statuses.get(rowId) ?? 'Not ready',
  };
}
