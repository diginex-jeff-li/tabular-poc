import { INVITE_COLUMNS, matchInviteHeader, type InviteField } from 'contracts';

/**
 * PROTOTYPE — column mapping for pasted client tables (see CONTEXT.md).
 *
 * A paste whose first line names columns is mapped by header name, using the
 * template's header and alias list; columns the template doesn't have are
 * ignored. When a required column has no match (or auto-match is off, or a
 * header-less paste is wider than the template) the paste is held as an
 * unmapped table: nothing enters the invite draft until a person applies a
 * column mapping — their own, or one the agent proposed.
 */
export interface UnmappedTable {
  headers: Array<string>;
  rows: Array<Array<string>>;
}

/** Per pasted column: the template column it fills, or null to ignore it. */
export type ColumnMapping = Array<InviteField | null>;

type DraftRow = Partial<Record<InviteField, string | null>>;

export type PastePlan =
  | { kind: 'insert'; rows: Array<DraftRow>; ignored: Array<string> }
  | { kind: 'hold'; table: UnmappedTable; mapping: ColumnMapping }
  | { kind: 'positional' };

function readTable(text: string): Array<Array<string>> {
  return text
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim())
    .map((line) => line.split('\t').map((cell) => cell.trim()));
}

export function planPaste(
  text: string,
  { autoMatch }: { autoMatch: boolean },
): PastePlan {
  const lines = readTable(text);
  const first = lines[0] ?? [];
  const matched = first.map(matchInviteHeader);
  const hasHeader = matched.some((f) => f !== null);

  if (!hasHeader) {
    if (first.length <= INVITE_COLUMNS.length) return { kind: 'positional' };
    return {
      kind: 'hold',
      table: { headers: first.map((_, i) => `Column ${i + 1}`), rows: lines },
      mapping: first.map((): null => null),
    };
  }

  const table = { headers: first, rows: lines.slice(1) };
  if (autoMatch && mappingProblems(matched).length === 0) {
    return { kind: 'insert', ...applyColumnMapping(table, matched) };
  }
  return {
    kind: 'hold',
    table,
    mapping: autoMatch ? matched : first.map((): null => null),
  };
}

export function applyColumnMapping(
  table: UnmappedTable,
  mapping: ColumnMapping,
): { rows: Array<DraftRow>; ignored: Array<string> } {
  const rows = table.rows.map((cells) => {
    const row: DraftRow = {};
    mapping.forEach((field, i) => {
      if (field) row[field] = cells[i] || null;
    });
    return row;
  });
  const ignored = table.headers.filter((_, i) => mapping[i] === null);
  return { rows, ignored };
}

/** Why a mapping cannot be applied yet; empty when it can. */
export function mappingProblems(mapping: ColumnMapping): Array<string> {
  const problems: Array<string> = [];
  for (const column of INVITE_COLUMNS) {
    const uses = mapping.filter((f) => f === column.field).length;
    if (uses > 1) {
      problems.push(`${column.header} is mapped from more than one column`);
    }
  }
  for (const column of INVITE_COLUMNS) {
    if (column.required && !mapping.includes(column.field)) {
      problems.push(`No column for ${column.header}`);
    }
  }
  return problems;
}
