import type { CellPos } from './gridRange';
import type { GridColumn } from './zodToColumnDefs';
import type { Row } from 'composables/useDataGrid';

/**
 * Copies a block of cells as TSV, no header row: one line per row, cells
 * joined by tabs. Like Tabulator's range copy, only columns that take part in
 * paste (`column.paste`) are copied, so Status and the checkbox column never
 * are, and a copied block pastes back positionally. A value holding a tab,
 * line break or quote is quoted the way Excel reads it. Blank cells copy as
 * empty strings.
 */
export function serializeTsv(
  rows: ReadonlyArray<Row>,
  cells: ReadonlyArray<ReadonlyArray<CellPos>>,
  columns: ReadonlyArray<GridColumn>,
): string {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const copied = new Set(columns.flatMap((c) => (c.paste ? [c.id] : [])));
  const lines = cells.map((line) =>
    line.filter((cell) => copied.has(cell.colId)),
  );
  if (!lines[0]?.length) {
    return '';
  }
  return lines
    .map((line) =>
      line
        .map((cell) => tsvField(byId.get(cell.rowId)?.[cell.colId]))
        .join('\t'),
    )
    .join('\n');
}

/**
 * Parses pasted TSV into partial rows, one per non-blank line. Cells map by
 * position onto the columns with `column.paste`, in column order, so a
 * read-only column anywhere in the grid never shifts the mapping. Extra
 * pasted cells are dropped; missing trailing ones are left out. Quoted cells
 * and `\r` are not handled (a known gap Tabulator shares).
 */
export function parsePositionalPaste(
  text: string,
  columns: ReadonlyArray<GridColumn>,
): Array<Record<string, string>> {
  const pasted = columns.filter((c) => c.paste);
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) =>
      Object.fromEntries(
        line
          .split('\t')
          .slice(0, pasted.length)
          .map((value, i) => [pasted[i].id, value]),
      ),
    );
}

function tsvField(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[\t\n\r"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
