/**
 * The seams `DataGrid` and the in-memory adapter (`memoryGridApi`) share: the
 * save result shape, which matches the contracts' BulkSaveError/Response, and
 * the programmatic grid access the invite draft, agent tools and file import
 * use.
 */
export interface GridSaveError {
  /** Index in the save request's `upserts`, not the row's place in the grid. */
  row: number;
  rowId: string;
  field: string;
  message: string;
}

export interface GridSaveResponse {
  errors: Array<GridSaveError>;
  saved: number;
}

/**
 * Sidebar label for a save error's row: its 1-based place in the grid as
 * shown, or "Hidden row" when a filter hides it.
 */
export function rowLabel(rowNumber: number | null): string {
  return rowNumber === null ? 'Hidden row' : `Row ${rowNumber}`;
}

/** Programmatic grid access for agent tools and file import. Rows by `id`. */
export interface GridApi {
  getRows(): Array<Record<string, unknown>>;
  addRows(rows: Array<Record<string, unknown>>): Promise<Array<string>>;
  updateRows(
    patches: Array<{ id: string } & Record<string, unknown>>,
  ): Promise<{ updated: Array<string>; missing: Array<string> }>;
  deleteRows(ids: Array<string>): {
    deleted: Array<string>;
    missing: Array<string>;
  };
  showErrors(errors: Array<GridSaveError>): void;
}
