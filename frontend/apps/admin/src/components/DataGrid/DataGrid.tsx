/**
 * DataGrid — the TanStack (`UTable`) grid engine's presentation.
 *
 * Same props contract as `GridEditor`, with engine-neutral `GridColumn`s.
 * All state lives in `useDataGrid`; `rows` is the single source of truth.
 *
 * Layout contract (mandatory): the root is `flex flex-col h-full`; the grid
 * host is `flex-1 min-h-0`, and `UTable`'s root (the scroll container) fills
 * it. No `100vh` arithmetic: the grid fills whatever height its parent gives.
 *
 * Rendering rules (see .scratch/tanstack-grid/issues/01-spike-utable-vs-headless.md):
 * - Columns are mapped to `UTable` columns once, in setup.
 * - Cells render through `GridCell`, which reads any per-cell state through
 *   its own `computed`; the column `cell` function reads no reactive state.
 * - Toolbar state renders in `DataGridToolbar`, so it doesn't re-render the
 *   component that renders `UTable`.
 * - Widths are fixed per column, so filtering never reflows the columns.
 */
import UTable from '@nuxt/ui/components/Table.vue';
import { ROW_HEIGHT, useDataGrid } from 'composables/useDataGrid';
import { defineComponent } from 'vue';
import type { TableColumn } from '@nuxt/ui/components/Table.vue';
import type { DataGridState, Row } from 'composables/useDataGrid';
import type { GridApi, GridSaveResponse } from 'composables/useGridEditor';
import type { GridColumn } from 'utils/zodToColumnDefs';
import type { PropType, VNode } from 'vue';

const DEFAULT_WIDTH = 160;
// Hoisted: a new object each render is a changed prop. A deep watch costs
// ~68ms per edit; rows are replaced, never mutated, so a shallow one suffices.
const WATCH_OPTIONS = { deep: false } as const;
// Opaque sticky header; row lines are drawn by GridCell so a row is exactly
// ROW_HEIGHT tall.
const TABLE_UI = { thead: 'bg-default', tbody: 'divide-y-0' } as const;
const getRowId = (row: Row): string => row.id;

const GridCell = defineComponent({
  name: 'GridCell',
  props: {
    row: { type: Object as PropType<Row>, required: true },
    colId: { type: String, required: true },
  },
  setup(props) {
    return (): VNode => (
      <div
        data-row-id={props.row.id}
        data-col-id={props.colId}
        class="flex items-center border-b border-default px-3"
        style={{ height: `${ROW_HEIGHT}px` }}
      >
        <span class="truncate">{String(props.row[props.colId] ?? '')}</span>
      </div>
    );
  },
});

const DataGridToolbar = defineComponent({
  name: 'DataGridToolbar',
  props: {
    grid: { type: Object as PropType<DataGridState>, required: true },
    title: { type: String, required: true },
    toolbarActions: {
      type: Function as PropType<() => VNode | Array<VNode>>,
      default: undefined,
    },
  },
  setup(props) {
    return (): VNode => (
      <div class="flex h-12 shrink-0 items-center gap-2 border-b border-default bg-muted px-4">
        <h1 class="mr-4 text-sm font-semibold text-highlighted">
          {props.title}
        </h1>
        {props.toolbarActions?.()}
        <div
          class="ml-auto flex items-center gap-3 text-xs"
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- toolbar status chips, not a calculation result (<output>)
          role="status"
          aria-live="polite"
        >
          <span class="text-muted">
            <strong class="text-default font-semibold">
              {props.grid.rowCount.value}
            </strong>{' '}
            rows
          </span>
        </div>
      </div>
    );
  },
});

function toTableColumn(column: GridColumn): TableColumn<Row> {
  const width = `${column.width ?? DEFAULT_WIDTH}px`;
  const size = { width, minWidth: width, maxWidth: width };
  return {
    id: column.id,
    accessorKey: column.id,
    header: column.title,
    cell: ({ row }) => <GridCell row={row.original} colId={column.id} />,
    meta: {
      class: { th: 'px-3 py-2', td: 'p-0' },
      style: { th: size, td: size },
    },
  };
}

export default defineComponent({
  name: 'DataGrid',
  props: {
    columns: {
      type: Array as PropType<Array<GridColumn>>,
      required: true,
    },
    data: {
      type: Array as PropType<Array<Record<string, unknown>>>,
      required: true,
    },
    onSave: {
      type: Function as PropType<
        (payload: {
          upserts: Array<Record<string, unknown>>;
          deletes: Array<string>;
        }) => Promise<GridSaveResponse>
      >,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    exportFilename: {
      type: String,
      required: true,
    },
    toolbarActions: {
      type: Function as PropType<() => VNode | Array<VNode>>,
      default: undefined,
    },
    /** Save button label (e.g. "Send invites"). */
    saveLabel: {
      type: String,
      default: 'Save',
    },
    /** Success badge text for N saved rows. */
    savedLabel: {
      type: Function as PropType<(saved: number) => string>,
      default: (saved: number) => `Saved ${saved}`,
    },
    /** Receives the programmatic grid API (agent tools, file import). */
    onReady: {
      type: Function as PropType<(api: GridApi) => void>,
      default: undefined,
    },
    /** Applied to every row that enters or is edited in the grid. */
    normalizeRow: {
      type: Function as PropType<
        (row: Record<string, unknown>) => Record<string, unknown>
      >,
      default: undefined,
    },
    /** Called with row ids after a person adds, pastes, edits or deletes rows. */
    onUserEdit: {
      type: Function as PropType<(rowIds: Array<string>) => void>,
      default: undefined,
    },
    /** Replaces the positional paste parser. */
    pasteParser: {
      type: Function as PropType<
        (
          clipboard: string,
          positional: () => Array<Record<string, unknown>>,
        ) => Array<Record<string, unknown>>
      >,
      default: undefined,
    },
  },
  setup(props) {
    const grid = useDataGrid({ data: props.data });
    const tableColumns = props.columns.map(toTableColumn);

    return (): VNode => (
      <div class="flex h-full flex-col overflow-hidden">
        <DataGridToolbar
          grid={grid}
          title={props.title}
          toolbarActions={props.toolbarActions}
        />
        <div class="relative min-h-0 flex-1 overflow-hidden">
          <UTable
            class="h-full"
            data={grid.rows.value}
            columns={tableColumns}
            getRowId={getRowId}
            sticky
            watchOptions={WATCH_OPTIONS}
            ui={TABLE_UI}
          />
        </div>
      </div>
    );
  },
});
