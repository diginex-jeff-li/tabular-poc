/**
 * The seams every grid engine (`DataGrid`, `GridEditor`) and the in-memory
 * adapter (`memoryGridApi`) share: the save result shape, which matches the
 * contracts' BulkSaveError/Response, and the programmatic grid access the
 * invite draft, agent tools and file import use.
 */
export interface GridSaveError {
  row: number;
  rowId: string;
  field: string;
  message: string;
}

export interface GridSaveResponse {
  errors: Array<GridSaveError>;
  saved: number;
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
