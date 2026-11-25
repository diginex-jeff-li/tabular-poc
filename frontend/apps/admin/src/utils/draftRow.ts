import {
  INVITE_FIELDS,
  INVITE_GROUPS,
  INVITE_ROLES,
  parseInviteGroups,
} from 'contracts';

/**
 * PROTOTYPE — turns whatever reached the invite draft into draft rows
 * (see CONTEXT.md and docs/adr/0001-draft-rows-vs-ready-rows.md).
 *
 * Runs on every way in (paste, Excel import, agent writes, cell edits) and is
 * idempotent. It never decides validity — that is `validateInvites` — and it
 * never guesses: a whole line in one cell is split only when every column is
 * clear; otherwise the text stays as typed and the row needs review.
 */
const DRAFT_FIELDS = INVITE_FIELDS;

const byLowerCase = (values: ReadonlyArray<string>) =>
  new Map(values.map((v) => [v.toLowerCase(), v]));
const ROLE_BY_KEY = byLowerCase(INVITE_ROLES);
const GROUP_BY_KEY = byLowerCase(INVITE_GROUPS);

// Longest first, so "Account Admin" wins over any shorter overlapping name.
const PHRASES = [
  ...INVITE_ROLES.map((value) => ({ value, kind: 'role' as const })),
  ...INVITE_GROUPS.map((value) => ({ value, kind: 'group' as const })),
]
  .sort((a, b) => b.value.length - a.value.length)
  .map(({ value, kind }) => ({
    value,
    kind,
    pattern: new RegExp(
      `(?<=\\s)${value
        .split(' ')
        .map((w) => w.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`))
        .join(String.raw`\s+`)}(?=\\s)`,
      'gi',
    ),
  }));

type Fields = Record<(typeof DRAFT_FIELDS)[number], string | null>;

function text(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function canonicalGroups(value: string | null): string | null {
  const names = [
    ...new Set(
      parseInviteGroups(value).map(
        (g) => GROUP_BY_KEY.get(g.toLowerCase()) ?? g,
      ),
    ),
  ];
  return names.length > 0 ? names.join('; ') : null;
}

function clean(fields: Fields): Fields {
  return {
    email: fields.email?.toLowerCase() ?? null,
    firstName: fields.firstName,
    lastName: fields.lastName,
    role: fields.role
      ? (ROLE_BY_KEY.get(fields.role.toLowerCase()) ?? fields.role)
      : null,
    groups: canonicalGroups(fields.groups),
  };
}

/** The one filled cell, when it holds more than one part. */
function lineText(fields: Fields): string | null {
  const filled = DRAFT_FIELDS.map((f) => fields[f]).filter((v) => v !== null);
  if (filled.length !== 1) {
    return null;
  }
  return /[\t|,\s]/.test(filled[0]) ? filled[0] : null;
}

function parseSeparated(line: string, separator: string): Fields | null {
  const pieces = line.split(separator).map(text);
  if (
    pieces.length !== DRAFT_FIELDS.length &&
    pieces.length !== DRAFT_FIELDS.length - 1
  ) {
    return null;
  }
  const [email, firstName, lastName, role, groups = null] = pieces;
  return { email, firstName, lastName, role, groups };
}

function parseSpaced(line: string): Fields | null {
  const roles: Array<string> = [];
  const groups: Array<{ value: string; at: number }> = [];
  let rest = ` ${line.replaceAll(';', ' ')} `;
  for (const { value, kind, pattern } of PHRASES) {
    // Blank the match out at equal length so offsets keep the typed order.
    rest = rest.replace(pattern, (match: string, at: number) => {
      if (kind === 'role') {
        roles.push(value);
      } else {
        groups.push({ value, at });
      }
      return ' '.repeat(match.length);
    });
  }
  const words = rest.split(/\s+/).filter(Boolean);
  const emails = words.filter((w) => w.includes('@'));
  const names = words.filter((w) => !w.includes('@'));
  if (emails.length !== 1 || roles.length !== 1 || names.length !== 2) {
    return null;
  }
  return {
    email: emails[0],
    firstName: names[0],
    lastName: names[1],
    role: roles[0],
    groups:
      groups.length > 0
        ? groups
            .sort((a, b) => a.at - b.at)
            .map((g) => g.value)
            .join('; ')
        : null,
  };
}

function parseLine(line: string): Fields | null {
  const separator = ['\t', '|', ','].find((s) => line.includes(s));
  return separator ? parseSeparated(line, separator) : parseSpaced(line);
}

/** The template's columns of a row, trimmed, blank as null. */
export function draftFields(row: Record<string, unknown>): Fields {
  return Object.fromEntries(
    DRAFT_FIELDS.map((f) => [f, text(row[f])]),
  ) as Fields;
}

/** Clean a row and split a whole line in one cell when that needs no guess. */
export function normalizeInviteRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const fields = draftFields(row);
  const line = lineText(fields);
  if (line === null) {
    return { ...row, ...clean(fields) };
  }
  const parsed = parseLine(line);
  if (parsed) {
    return { ...row, ...clean(parsed) };
  }
  // Needs review: keep the text as typed, in the cell it was typed in.
  const kept = Object.fromEntries(
    DRAFT_FIELDS.filter((f) => fields[f] !== null).map((f) => [f, fields[f]]),
  );
  const others = Object.fromEntries(
    Object.entries(row).filter(
      ([k]) => !(DRAFT_FIELDS as ReadonlyArray<string>).includes(k),
    ),
  );
  return { ...others, ...kept };
}

/** A whole line in one cell that cannot be split without guessing. */
export function needsReview(row: Record<string, unknown>): boolean {
  const line = lineText(draftFields(row));
  return line !== null && parseLine(line) === null;
}

export const INVITE_ROW_STATUSES = [
  'Ready',
  'Not ready',
  'Needs review',
  'Agent proposed',
] as const;
export type InviteRowStatus = (typeof INVITE_ROW_STATUSES)[number];

/** Status shown in the grid and to the agent; `errors` from `validateInvites`. */
export function inviteRowStatus(
  row: Record<string, unknown>,
  errors: ReadonlyArray<{ rowId: string }>,
  agentProposed: ReadonlySet<string>,
): InviteRowStatus {
  const id = String(row.id);
  if (needsReview(row)) {
    return 'Needs review';
  }
  if (agentProposed.has(id)) {
    return 'Agent proposed';
  }
  return errors.some((e) => e.rowId === id) ? 'Not ready' : 'Ready';
}
