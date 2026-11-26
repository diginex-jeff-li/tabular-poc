import type { GridColumn, Row } from './gridApi';

/**
 * The grid as CSV for download: a header line of column titles, then every
 * row in `rows` order (pass the grid's rows, not its sorted or filtered view).
 * Only columns with `column.export` are included, so Status and the checkbox
 * column are left out. Comma-delimited with RFC 4180 quoting and CRLF line
 * ends; blank cells are empty fields.
 */
export function buildCsv(
  rows: ReadonlyArray<Row>,
  columns: ReadonlyArray<GridColumn>,
): string {
  const exported = columns.filter((c) => c.export);
  return [
    exported.map((c) => c.title),
    ...rows.map((row) => exported.map((c) => row[c.id])),
  ]
    .map((line) => line.map(csvField).join(','))
    .join('\r\n');
}

function csvField(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
