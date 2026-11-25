import { computed, shallowRef } from 'vue';
import type { ComputedRef, ShallowRef } from 'vue';

/** A grid row. Rows are never mutated; every change replaces the row and the array. */
export type Row = Record<string, unknown> & { id: string };

/** Height of every body row in px, border included. Editors must fit inside it. */
export const ROW_HEIGHT = 36;

/** State behind `DataGrid`. `rows` is the single source of truth; the table only renders it. */
export interface DataGridState {
  rows: ShallowRef<ReadonlyArray<Row>>;
  rowCount: ComputedRef<number>;
}

export function useDataGrid(opts: {
  data: ReadonlyArray<Record<string, unknown>>;
}): DataGridState {
  const rows = shallowRef<ReadonlyArray<Row>>(
    opts.data.map((row) =>
      typeof row.id === 'string' && row.id !== ''
        ? (row as Row)
        : { ...row, id: crypto.randomUUID() },
    ),
  );
  const rowCount = computed(() => rows.value.length);

  return { rows, rowCount };
}
