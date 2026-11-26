import type { GridSaveError } from './gridApi';
import type { GridColumn } from './zodToColumnDefs';
import type { Row } from 'composables/useDataGrid';

/** Messages by row id, then column id. Only rows with a message appear. */
export type CellMessages = ReadonlyMap<
  string,
  Readonly<Record<string, string>>
>;

/**
 * Every invalid cell's message, from each column's own rule. Derived from the
 * rows as they are, so a paste, an agent write or a range clear needs no
 * re-validation step.
 */
export function validateRows(
  rows: ReadonlyArray<Row>,
  columns: ReadonlyArray<GridColumn>,
): CellMessages {
  const messages = new Map<string, Record<string, string>>();
  for (const row of rows) {
    let invalid: Record<string, string> | undefined;
    for (const column of columns) {
      const message = column.validate(row[column.id]);
      if (message !== null) {
        (invalid ??= {})[column.id] = message;
      }
    }
    if (invalid) {
      messages.set(row.id, invalid);
    }
  }
  return messages;
}

/** Backend save errors by row id and field. The first message for a cell wins. */
export function indexSaveErrors(
  errors: ReadonlyArray<GridSaveError>,
): CellMessages {
  const messages = new Map<string, Record<string, string>>();
  for (const error of errors) {
    const row = messages.get(error.rowId) ?? {};
    if (!(error.field in row)) {
      messages.set(error.rowId, { ...row, [error.field]: error.message });
    }
  }
  return messages;
}
