import type { VNode } from 'vue';
import type { ZodError } from 'zod';

/**
 * The seams `DataGrid` (through `useDataGrid`) exposes: the row and column
 * shapes every page and grid module shares, the save result every `onSave`
 * returns, and the programmatic grid access the invite draft, agent tools
 * and file import use.
 */

/** A grid row. Rows are never mutated; every change replaces the row and the array. */
export type Row = Record<string, unknown> & { id: string };

/**
 * One grid column, kept apart from `UTable`'s column type. `DataGrid` maps it
 * to a `UTable` column; validation, paste, CSV and range logic read it
 * directly. `zodToColumnDefs` derives most columns; a page may build its own.
 */
export type GridColumn = {
  id: string;
  title: string;
  /** The message for an invalid value, or null when the value is valid. */
  validate: (value: unknown) => string | null;
  /** Takes a position when pasted rows are parsed. */
  paste: boolean;
  /** Included in CSV export. */
  export: boolean;
  /** Fixed width in px. */
  width?: number;
  /** Stays at the left edge while the grid scrolls sideways. */
  pinned?: boolean;
} & (
  | { editor: 'choice'; options: ReadonlyArray<string> }
  | { editor: 'text' }
  | {
      editor: null;
      /**
       * Renders the cell instead of the row's value; the column can't be
       * sorted. Re-runs when the row changes and when errors are shown
       * (`GridApi.showErrors`), so it may show state kept outside the row.
       */
      render?: (row: Row) => VNode;
    }
);

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

/**
 * Programmatic grid access for the invite draft, agent tools and file
 * import. Rows by `id`. Every row written goes through the grid's
 * `normalizeRow`.
 */
export interface GridApi {
  getRows: () => Array<Row>;
  /**
   * A person brings rows (file import, an applied column mapping): appended
   * with fresh ids as an append paste is, one undo step, reported to
   * `onUserEdit`. Returns the new ids.
   */
  importRows: (rows: Array<Record<string, unknown>>) => Array<string>;
  /**
   * The agent writes: `addRows` appends with fresh ids (returned),
   * `updateRows` merges patches, `deleteRows` removes. Not reported to
   * `onUserEdit` and not undoable: a write that changes rows empties the
   * undo and redo history.
   */
  addRows: (rows: Array<Record<string, unknown>>) => Array<string>;
  updateRows: (patches: Array<Row>) => {
    updated: Array<string>;
    missing: Array<string>;
  };
  deleteRows: (ids: Array<string>) => {
    deleted: Array<string>;
    missing: Array<string>;
  };
  showErrors: (errors: Array<GridSaveError>) => void;
}
