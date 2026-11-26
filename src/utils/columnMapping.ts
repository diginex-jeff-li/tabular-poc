import { INVITE_COLUMNS, matchInviteHeader } from 'contracts';
import { parseTsv } from './gridClipboard';
import type { InviteField } from 'contracts';

/**
 * PROTOTYPE — column mapping for client tables, pasted or imported from Excel
 * (see CONTEXT.md).
 *
 * A table with a header row is mapped by header name, using the template's
 * header and alias list; columns the template doesn't have are ignored. When
 * a required column has no match, a template column is matched twice, or
 * auto-match is off, the table is held as an unmapped table: nothing enters
 * the invite draft until a person applies a column mapping — their own, or
 * one the agent proposed. A header-less paste goes in by position, or is held
 * with numbered columns when it is wider than the template.
 */
export interface UnmappedTable {
  headers: Array<string>;
  rows: Array<Array<string>>;
}

/** Per pasted column: the template column it fills, or null to ignore it. */
export type ColumnMapping = Array<InviteField | null>;

type DraftRow = Partial<Record<InviteField, string | null>>;

type TablePlan =
  | { kind: 'insert'; rows: Array<DraftRow>; ignored: Array<string> }
  | { kind: 'hold'; table: UnmappedTable; mapping: ColumnMapping };

export type PastePlan = TablePlan | { kind: 'positional' };

/** A table whose first row names its columns: insert it, or hold it. */
export function planTable(
  table: UnmappedTable,
  { autoMatch }: { autoMatch: boolean },
): TablePlan {
  const matched = table.headers.map(matchInviteHeader);
  if (autoMatch && mappingProblems(matched).length === 0) {
    return { kind: 'insert', ...applyColumnMapping(table, matched) };
  }
  return {
    kind: 'hold',
    table,
    mapping: autoMatch ? matched : table.headers.map((): null => null),
  };
}

/** Pasted text as trimmed cells, blank lines left out. */
function readTable(text: string): Array<Array<string>> {
  return parseTsv(text)
    .map((cells) => cells.map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean));
}

/** Pasted text: a header line goes through `planTable`; a header-less body by position. */
export function planPaste(
  text: string,
  { autoMatch }: { autoMatch: boolean },
): PastePlan {
  const lines = readTable(text);
  const first = lines[0] ?? [];
  if (first.some((cell) => matchInviteHeader(cell) !== null)) {
    return planTable({ headers: first, rows: lines.slice(1) }, { autoMatch });
  }
  if (first.length <= INVITE_COLUMNS.length) {
    return { kind: 'positional' };
  }
  return {
    kind: 'hold',
    table: { headers: first.map((_, i) => `Column ${i + 1}`), rows: lines },
    mapping: first.map((): null => null),
  };
}

export function applyColumnMapping(
  table: UnmappedTable,
  mapping: ColumnMapping,
): { rows: Array<DraftRow>; ignored: Array<string> } {
  const rows = table.rows.map((cells) => {
    const row: DraftRow = {};
    mapping.forEach((field, i) => {
      if (field) {
        row[field] = cells[i] || null;
      }
    });
    return row;
  });
  // A column without a header carries nothing worth naming.
  const ignored = table.headers.filter(
    (header, i) => mapping[i] === null && header !== '',
  );
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
