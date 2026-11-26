import type { GridColumn, Row } from './gridApi';
import type { CellPos } from './gridRange';

/**
 * Copies a block of cells as TSV, no header row: one line per row, cells
 * joined by tabs. As in a spreadsheet range copy, only columns that take part
 * in paste (`column.paste`) are copied, so Status and the checkbox column
 * never are, and a copied block pastes back positionally. A value holding a tab,
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
 * One cell and the break after it: a tab, a line break, or the end. A cell is
 * quoted only when its closing quote sits right before that break.
 */
const TSV_FIELD = /(?:"((?:[^"]|"")*)"|([^\t\n]*?))(\t|\r?\n|$)/gy;

/**
 * Clipboard TSV as lines of cells, the inverse of `serializeTsv`. Lines end
 * in `\n` or `\r\n`, and one trailing line break (Excel ends every copy with
 * one) is dropped. A cell wrapped in quotes, with `""` for a quote inside, may
 * hold tabs and line breaks; a quote anywhere else is plain text. A blank
 * line is a line of one blank cell.
 */
export function parseTsv(text: string): Array<Array<string>> {
  const body = text.replace(/\r?\n$/, '');
  if (body === '') {
    return [];
  }
  const lines: Array<Array<string>> = [];
  let line: Array<string> = [];
  for (const [, quoted, plain, end] of body.matchAll(TSV_FIELD)) {
    line.push(quoted === undefined ? plain : quoted.replaceAll('""', '"'));
    if (end !== '\t') {
      lines.push(line);
      line = [];
    }
    if (end === '') {
      break;
    }
  }
  return lines;
}

/**
 * Parses pasted TSV into partial rows, one per line that isn't blank. Cells
 * map by position onto the columns with `column.paste`, in column order, so a
 * read-only column anywhere in the grid never shifts the mapping. Extra
 * pasted cells are dropped; missing trailing ones are left out.
 */
export function parsePositionalPaste(
  text: string,
  columns: ReadonlyArray<GridColumn>,
): Array<Record<string, string>> {
  const pasted = columns.filter((c) => c.paste);
  return parseTsv(text)
    .filter((cells) => cells.some((cell) => cell.trim()))
    .map((cells) =>
      Object.fromEntries(
        cells.slice(0, pasted.length).map((value, i) => [pasted[i].id, value]),
      ),
    );
}

function tsvField(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[\t\n\r"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
