/**
 * DataGrid — the TanStack (`UTable`) grid engine's presentation.
 *
 * Same props contract as `GridEditor` (`gridEngineProps`), with
 * engine-neutral `GridColumn`s. Row state lives in `useDataGrid`; `rows` is
 * the single source of truth. Sorting and filtering are views over it: they
 * never change row ids or the order of `rows`.
 *
 * Layout contract (mandatory): the root is `flex flex-col h-full`; the grid
 * host is `flex-1 min-h-0`, and `UTable`'s root (the scroll container) fills
 * it. No `100vh` arithmetic: the grid fills whatever height its parent gives.
 *
 * Rendering rules (see .scratch/tanstack-grid/issues/01-spike-utable-vs-headless.md):
 * - Columns are mapped to `UTable` columns once, in setup.
 * - Cells and headers render through components (`GridCell`, `SelectCell`,
 *   `HeaderCell`) that read per-cell state through their own `computed`; the
 *   column `cell`/`header` functions read no reactive state.
 * - Toolbar state renders in `DataGridToolbar`, so it doesn't re-render the
 *   component that renders `UTable`.
 * - Widths are fixed per column, so filtering never reflows the columns.
 */
import UCheckbox from '@nuxt/ui/components/Checkbox.vue';
import UTable from '@nuxt/ui/components/Table.vue';
import { gridEngineProps } from 'components/gridEngineProps';
import { ROW_HEIGHT, useDataGrid } from 'composables/useDataGrid';
import { computed, defineComponent, ref } from 'vue';
import DataGridToolbar from './DataGridToolbar';
import HeaderCell from './HeaderCell';
import type { TableColumn } from '@nuxt/ui/components/Table.vue';
import type { DataGridState, Row } from 'composables/useDataGrid';
import type { GridColumn } from 'utils/zodToColumnDefs';
import type { PropType, VNode } from 'vue';

const DEFAULT_WIDTH = 160;
const SELECT_WIDTH = 44;
// Hoisted: a new object each render is a changed prop. A deep watch costs
// ~68ms per edit; rows are replaced, never mutated, so a shallow one suffices.
const WATCH_OPTIONS = { deep: false } as const;
// Opaque sticky header; row lines are drawn by the cells so a row is exactly
// ROW_HEIGHT tall.
const TABLE_UI = { thead: 'bg-default', tbody: 'divide-y-0' } as const;
const getRowId = (row: Row): string => row.id;

/** UTable's controlled sort and filter state (TanStack's shapes). */
type Sorting = Array<{ id: string; desc: boolean }>;
type ColumnFilters = Array<{ id: string; value: unknown }>;

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

/** A row's checkbox. Ticking is the only way to select a row. */
const SelectCell = defineComponent({
  name: 'SelectCell',
  props: {
    rowId: { type: String, required: true },
    grid: { type: Object as PropType<DataGridState>, required: true },
  },
  setup(props) {
    const checked = computed(
      () => props.grid.rowSelection.value[props.rowId] === true,
    );
    return (): VNode => (
      <div
        class="flex items-center justify-center border-b border-default"
        style={{ height: `${ROW_HEIGHT}px` }}
      >
        <UCheckbox
          aria-label="Select row"
          modelValue={checked.value}
          onUpdate:modelValue={(value: boolean | 'indeterminate') =>
            props.grid.setRowSelected(props.rowId, value === true)
          }
        />
      </div>
    );
  },
});

function fixedWidth(px: number) {
  const width = `${px}px`;
  const size = { width, minWidth: width, maxWidth: width };
  return { th: size, td: size };
}

/** Checkbox column; the header ticks every row the filters let through. */
function selectColumn(grid: DataGridState): TableColumn<Row> {
  return {
    id: '__select',
    header: ({ table }) => (
      <div class="flex items-center justify-center">
        <UCheckbox
          aria-label="Select all rows"
          modelValue={
            table.getIsAllRowsSelected()
              ? true
              : table.getIsSomeRowsSelected()
                ? 'indeterminate'
                : false
          }
          onUpdate:modelValue={(value: boolean | 'indeterminate') =>
            table.toggleAllRowsSelected(value === true)
          }
        />
      </div>
    ),
    cell: ({ row }) => <SelectCell rowId={row.id} grid={grid} />,
    enableSorting: false,
    enableColumnFilter: false,
    meta: {
      class: { th: 'p-0', td: 'p-0' },
      style: fixedWidth(SELECT_WIDTH),
    },
  };
}

function dataColumn(column: GridColumn): TableColumn<Row> {
  return {
    id: column.id,
    accessorKey: column.id,
    header: ({ column: api }) => <HeaderCell column={api} def={column} />,
    cell: ({ row }) => <GridCell row={row.original} colId={column.id} />,
    // UTable sets aria-sort only when this is literally true.
    enableSorting: true,
    sortingFn: 'alphanumeric',
    sortDescFirst: false,
    enableColumnFilter: column.filter !== null,
    filterFn: column.filter === 'choice' ? 'equals' : 'includesString',
    meta: {
      class: { th: 'p-0 align-top', td: 'p-0' },
      style: fixedWidth(column.width ?? DEFAULT_WIDTH),
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
    ...gridEngineProps,
  },
  setup(props) {
    const grid = useDataGrid({
      data: props.data,
      onSave: props.onSave,
      normalizeRow: props.normalizeRow,
      onUserEdit: props.onUserEdit,
    });
    const tableColumns = [selectColumn(grid), ...props.columns.map(dataColumn)];
    const sorting = ref<Sorting>([]);
    const columnFilters = ref<ColumnFilters>([]);

    return (): VNode => (
      <div class="flex h-full flex-col overflow-hidden">
        <DataGridToolbar
          grid={grid}
          title={props.title}
          saveLabel={props.saveLabel}
          savedLabel={props.savedLabel}
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
            sorting={sorting.value}
            onUpdate:sorting={(value: Sorting) => {
              sorting.value = value;
            }}
            columnFilters={columnFilters.value}
            onUpdate:columnFilters={(value: ColumnFilters) => {
              columnFilters.value = value;
            }}
            rowSelection={grid.rowSelection.value}
            onUpdate:rowSelection={(value: Record<string, boolean>) => {
              grid.rowSelection.value = value;
            }}
          />
        </div>
      </div>
    );
  },
});
