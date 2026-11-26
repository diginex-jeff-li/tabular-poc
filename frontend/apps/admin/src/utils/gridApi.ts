import type { ZodError } from 'zod';

/**
 * The seams `DataGrid` (through `useDataGrid`) exposes: the save result
 * every `onSave` returns, and the programmatic grid access the invite draft,
 * agent tools and file import use.
 */
export interface GridSaveError {
  rowId: string;
  field: string;
  message: string;
}

export interface GridSaveResponse {
  errors: Array<GridSaveError>;
  saved: number;
}

/** A save error before it is pinned to a row. */
export type FieldProblem = Pick<GridSaveError, 'field' | 'message'>;

/** A failed Zod parse of one row as save errors: the top-level field, or "?". */
export function fieldProblems(error: ZodError): Array<FieldProblem> {
  return error.issues.map((issue) => ({
    field: String(issue.path[0] ?? '?'),
    message: issue.message,
  }));
}

/** Programmatic grid access for agent tools and file import. Rows by `id`. */
export interface GridApi {
  getRows(): Array<Record<string, unknown>>;
  addRows(rows: Array<Record<string, unknown>>): Array<string>;
  updateRows(patches: Array<{ id: string } & Record<string, unknown>>): {
    updated: Array<string>;
    missing: Array<string>;
  };
  deleteRows(ids: Array<string>): {
    deleted: Array<string>;
    missing: Array<string>;
  };
  showErrors(errors: Array<GridSaveError>): void;
}
