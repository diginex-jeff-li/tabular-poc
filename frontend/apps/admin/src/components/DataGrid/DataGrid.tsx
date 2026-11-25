/**
 * DataGrid — the TanStack (`UTable`) grid engine's presentation.
 *
 * Same props contract as `GridEditor` (`gridEngineProps`), with
 * engine-neutral `GridColumn`s. Row state lives in `useDataGrid`; `rows` is
 * the single source of truth. Sorting and filtering are views over it: they
 * never change row ids or the order of `rows`. Active cell, range and the
 * editing cell live in `useGridSelection`, by row and column id.
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
 * - Toolbar and error state render in `DataGridToolbar` and `ErrorSidebar`,
 *   so they don't re-render the component that renders `UTable`.
 * - Widths are fixed per column, so filtering never reflows the columns.
 *
 * Keyboard and clipboard: `UTable`'s root takes focus (`tabindex=0`; a press
 * on a cell focuses it natively) and receives every key, `copy` and `paste`.
 * Each root handler first ignores events from a control inside the grid (a
 * header filter, a sort button, an open editor).
 */
import UCheckbox from '@nuxt/ui/components/Checkbox.vue';
import UTable from '@nuxt/ui/components/Table.vue';
import {
  onKeyStroke,
  refAutoReset,
  useEventListener,
  useMousePressed,
} from '@vueuse/core';
import { gridEngineProps } from 'components/gridEngineProps';
import { ROW_HEIGHT, useDataGrid } from 'composables/useDataGrid';
import { useGridSelection } from 'composables/useGridSelection';
import { serializeTsv } from 'utils/gridClipboard';
import { indexSaveErrors, validateRows } from 'utils/gridValidation';
import {
  computed,
  defineComponent,
  nextTick,
  onMounted,
  ref,
  shallowRef,
} from 'vue';
import DataGridToolbar from './DataGridToolbar';
import ErrorSidebar from './ErrorSidebar';
import GridCell from './GridCell';
import HeaderCell from './HeaderCell';
import type { EditEnd, GridCellContext } from './GridCell';
import type { TableColumn } from '@nuxt/ui/components/Table.vue';
import type { DataGridState, Row } from 'composables/useDataGrid';
import type { GridSaveError } from 'composables/useGridEditor';
import type { GridSelection } from 'composables/useGridSelection';
import type { CellPos, Dir, GridOrder } from 'utils/gridRange';
import type { GridColumn } from 'utils/zodToColumnDefs';
import type { PropType, VNode } from 'vue';

const DEFAULT_WIDTH = 160;
const SELECT_WIDTH = 44;
/** The error sidebar's width (`w-80`), which covers the grid's right edge. */
const SIDEBAR_WIDTH = 320;
// Hoisted: a new object each render is a changed prop. A deep watch costs
// ~68ms per edit; rows are replaced, never mutated, so a shallow one suffices.
const WATCH_OPTIONS = { deep: false } as const;
// Opaque sticky header; row lines are drawn by the cells so a row is exactly
// ROW_HEIGHT tall.
const TABLE_UI = { thead: 'bg-default', tbody: 'divide-y-0' } as const;
// UTable's props type has no `tabindex`; it reaches the root div via $attrs.
const FOCUSABLE = { tabindex: 0 } as const;
const getRowId = (row: Row): string => row.id;

/** Events from these belong to the control, not to the grid. */
const CONTROLS =
  'input,textarea,select,button,[role=combobox],[data-grid-editor]';
const fromControl = (e: Event): boolean =>
  (e.target as Element).closest(CONTROLS) !== null;

/** Arrow keys: one step, or with Ctrl/Cmd to the edge. */
const ARROWS: Partial<Record<string, readonly [Dir, Dir]>> = {
  ArrowUp: ['up', 'top'],
  ArrowDown: ['down', 'bottom'],
  ArrowLeft: ['left', 'home'],
  ArrowRight: ['right', 'end'],
};

/** Where a key moves the active cell. Tab stops at the row's edge (Tabulator's range mode). */
function keyDir(e: KeyboardEvent): Dir | null {
  const arrow = ARROWS[e.key];
  if (arrow) {
    return arrow[e.ctrlKey || e.metaKey ? 1 : 0];
  }
  if (e.key === 'Tab') {
    return e.shiftKey ? 'left' : 'right';
  }
  return e.key === 'Home' ? 'home' : e.key === 'End' ? 'end' : null;
}

/** UTable's controlled sort and filter state (TanStack's shapes). */
type Sorting = Array<{ id: string; desc: boolean }>;
type ColumnFilters = Array<{ id: string; value: unknown }>;

/** What `UTable` exposes (spike: `$el` is the scroll container and focus target). */
type TableHandle = {
  $el: HTMLElement | undefined;
  tableRef: HTMLTableElement | null;
  tableApi: { getRowModel(): { rows: Array<{ id: string }> } };
};

/** A row's checkbox. Ticking is the only way to tick a row; a press beside it selects the row's cells. */
const SelectCell = defineComponent({
  name: 'SelectCell',
  props: {
    rowId: { type: String, required: true },
    grid: { type: Object as PropType<DataGridState>, required: true },
    selection: { type: Object as PropType<GridSelection>, required: true },
  },
  setup(props) {
    const checked = computed(
      () => props.grid.rowSelection.value[props.rowId] === true,
    );
    return (): VNode => (
      <div
        class="flex select-none items-center justify-center border-b border-default"
        style={{ height: `${ROW_HEIGHT}px` }}
        onPointerdown={(e: PointerEvent) => {
          if (e.button === 0 && !(e.target as Element).closest('button')) {
            props.selection.selectRow(props.rowId);
          }
        }}
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
function selectColumn(
  grid: DataGridState,
  selection: GridSelection,
): TableColumn<Row> {
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
    cell: ({ row }) => (
      <SelectCell rowId={row.id} grid={grid} selection={selection} />
    ),
    enableSorting: false,
    enableColumnFilter: false,
    meta: {
      class: { th: 'p-0', td: 'p-0' },
      style: fixedWidth(SELECT_WIDTH),
    },
  };
}

function dataColumn(
  column: GridColumn,
  index: number,
  ctx: GridCellContext,
): TableColumn<Row> {
  return {
    id: column.id,
    accessorKey: column.id,
    header: ({ column: api }) => (
      <HeaderCell
        column={api}
        def={column}
        onSelectColumn={() => ctx.selection.selectColumn(column.id)}
      />
    ),
    cell: ({ row }) => (
      <GridCell
        row={row.original}
        column={column}
        colIndex={index + 2}
        ctx={ctx}
      />
    ),
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
    const columnsById = new Map(props.columns.map((c) => [c.id, c]));
    const colIds = props.columns.map((c) => c.id);
    const table = shallowRef<TableHandle | null>(null);
    const gridEl = computed(() => table.value?.$el);
    // What the grid shows, in screen order: UTable's sorted and filtered rows.
    const order = computed<GridOrder>(() => ({
      rowIds: table.value?.tableApi.getRowModel().rows.map((r) => r.id) ?? [],
      colIds,
    }));
    const selection = useGridSelection(order);
    const sorting = ref<Sorting>([]);
    const columnFilters = ref<ColumnFilters>([]);
    const { pressed } = useMousePressed({
      target: gridEl,
      touch: false,
      drag: false,
    });

    /** Scrolls the least distance that shows the whole cell, left of `rightInset` px. */
    function reveal(pos: CellPos, rightInset = 0) {
      const el = gridEl.value;
      const row = order.value.rowIds.indexOf(pos.rowId);
      const ths = el?.querySelectorAll<HTMLElement>('thead th');
      // +1: the checkbox column comes first.
      const th = ths?.[order.value.colIds.indexOf(pos.colId) + 1];
      if (!el || row === -1 || !th) {
        return;
      }
      const top = row * ROW_HEIGHT;
      const view = el.clientHeight - th.offsetHeight;
      el.scrollTop = Math.min(
        Math.max(el.scrollTop, top + ROW_HEIGHT - view),
        top,
      );
      const width = el.clientWidth - rightInset;
      el.scrollLeft = Math.min(
        Math.max(el.scrollLeft, th.offsetLeft + th.offsetWidth - width),
        th.offsetLeft,
      );
    }

    function startEdit(pos: CellPos, seed: string | null) {
      if (columnsById.get(pos.colId)?.editor) {
        selection.startEdit(pos, seed);
      }
    }

    // Idempotent: blur after Enter/Tab/Escape, or a pick then the menu
    // closing, finds the edit already ended and does nothing.
    function endEdit(pos: CellPos, { value, dir, refocus }: EditEnd) {
      const editing = selection.state.value.editing?.pos;
      if (editing?.rowId !== pos.rowId || editing.colId !== pos.colId) {
        return;
      }
      selection.stopEdit();
      if (value !== null) {
        grid.editCell(pos, value);
      }
      if (dir && selection.step(dir)) {
        reveal(selection.active.value ?? pos);
      }
      if (refocus) {
        // The editor's input is gone after the next render.
        void nextTick(() => gridEl.value?.focus({ preventScroll: true }));
      }
    }

    const ctx: GridCellContext = {
      selection,
      invalid: computed(() => validateRows(grid.rows.value, props.columns)),
      saveErrors: computed(() => indexSaveErrors(grid.errorList.value)),
      outline: refAutoReset<CellPos | null>(null, 2000),
      pressed,
      startEdit,
      endEdit,
    };
    const tableColumns = [
      selectColumn(grid, selection),
      ...props.columns.map((column, i) => dataColumn(column, i, ctx)),
    ];

    function navigate(e: KeyboardEvent, dir: Dir) {
      const tab = e.key === 'Tab';
      if (!selection.active.value) {
        const first = order.value.rowIds[0];
        if (!tab && first !== undefined) {
          e.preventDefault();
          selection.select({ rowId: first, colId: colIds[0] });
        }
        return;
      }
      const moved = selection.step(dir, e.shiftKey && !tab);
      // Tab at the row's edge leaves the grid instead of trapping focus.
      if (moved || !tab) {
        e.preventDefault();
      }
      const focus = selection.state.value.range?.focus;
      if (moved && focus) {
        reveal(focus);
      }
    }

    onKeyStroke(
      true,
      (e: KeyboardEvent) => {
        if (fromControl(e)) {
          return;
        }
        const dir = keyDir(e);
        const pos = selection.active.value;
        if (dir) {
          navigate(e, dir);
          return;
        }
        if (!pos) {
          return;
        }
        switch (e.key) {
          case 'Enter':
            e.preventDefault();
            startEdit(pos, null);
            return;
          case 'Delete':
          case 'Backspace':
            // Ticket 08: clear the range's editable cells.
            return;
          default:
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              // Typing replaces the value, as in Excel.
              e.preventDefault();
              startEdit(pos, e.key);
            }
        }
      },
      { target: gridEl },
    );

    useEventListener(gridEl, 'copy', (e: ClipboardEvent) => {
      if (fromControl(e) || !selection.state.value.range) {
        return;
      }
      e.clipboardData?.setData(
        'text/plain',
        serializeTsv(grid.rows.value, selection.cells(), props.columns),
      );
      e.preventDefault();
    });

    // Ticket 07: `useEventListener(gridEl, 'paste', …)` goes here, with the
    // same `fromControl` bail-out.

    /** A sidebar error: bring its row into view, select and outline the cell. */
    function showError(error: GridSaveError) {
      const el = gridEl.value;
      const row = order.value.rowIds.indexOf(error.rowId);
      if (!el || row === -1) {
        return;
      }
      const pos = { rowId: error.rowId, colId: error.field };
      el.scrollTop = row * ROW_HEIGHT;
      if (columnsById.has(pos.colId)) {
        selection.select(pos);
        reveal(pos, SIDEBAR_WIDTH);
      }
      ctx.outline.value = pos;
      el.focus({ preventScroll: true });
    }

    // UTable renders a native <table>; the grid role makes its rows and
    // cells a grid's rows and gridcells. UTable binds neither attribute.
    onMounted(() => {
      table.value?.tableRef?.setAttribute('role', 'grid');
      table.value?.tableRef?.setAttribute('aria-multiselectable', 'true');
    });

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
            ref={table}
            class="h-full"
            {...FOCUSABLE}
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
          <ErrorSidebar grid={grid} onPick={showError} />
        </div>
      </div>
    );
  },
});
