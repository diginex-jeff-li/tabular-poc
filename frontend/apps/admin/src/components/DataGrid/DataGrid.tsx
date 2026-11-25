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
  useFocus,
  useMousePressed,
  useRafFn,
} from '@vueuse/core';
import { gridEngineProps } from 'components/gridEngineProps';
import { ROW_HEIGHT, useDataGrid } from 'composables/useDataGrid';
import { useGridSelection } from 'composables/useGridSelection';
import { parsePositionalPaste, serializeTsv } from 'utils/gridClipboard';
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
import EmptyState from './EmptyState';
import ErrorSidebar from './ErrorSidebar';
import GridCell from './GridCell';
import HeaderCell from './HeaderCell';
import type { EditEnd, GridCellContext } from './GridCell';
import type { TableColumn } from '@nuxt/ui/components/Table.vue';
import type { DataGridState, Row } from 'composables/useDataGrid';
import type { GridSelection } from 'composables/useGridSelection';
import type { GridSaveError } from 'utils/gridApi';
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
// Only rows near the viewport are in the DOM. Every row is exactly ROW_HEIGHT
// tall, so a row's offset is `index * ROW_HEIGHT` (`reveal`, `showError`).
// A fast scroll mounts the visible rows plus 2 × overscan in one frame; at the
// default 12 that frame took over 50ms with 2,000 rows (ticket 11).
const VIRTUALIZE = { estimateSize: ROW_HEIGHT, overscan: 4 } as const;
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

/**
 * Arrows step one cell, or with Ctrl/Cmd jump to the edge. Home/End go to the
 * row's ends, or with Ctrl/Cmd to the grid's first/last cell (as in Excel).
 */
const MOVES: Partial<Record<string, readonly [Dir, Dir]>> = {
  ArrowUp: ['up', 'top'],
  ArrowDown: ['down', 'bottom'],
  ArrowLeft: ['left', 'home'],
  ArrowRight: ['right', 'end'],
  Home: ['home', 'first'],
  End: ['end', 'last'],
};

/** Where a key moves the active cell. Tab stops at the row's edge (Tabulator's range mode). */
function keyDir(e: KeyboardEvent): Dir | null {
  const move = MOVES[e.key];
  if (move) {
    return move[e.ctrlKey || e.metaKey ? 1 : 0];
  }
  return e.key === 'Tab' ? (e.shiftKey ? 'left' : 'right') : null;
}

const clamp = (n: number, min: number, max: number): number =>
  Math.min(Math.max(n, min), max);

/**
 * How far a drag scrolls this frame along one axis: the pointer's distance
 * past the body's `start`/`end` edge, at most a row. Zero inside the body,
 * so pressing a cell at the edge doesn't scroll.
 */
const edgeStep = (p: number, start: number, end: number): number =>
  clamp(p < start ? p - start : p > end ? p - end : 0, -ROW_HEIGHT, ROW_HEIGHT);

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

/** `colIndex` is 1-based in screen order, the checkbox column included. */
function dataColumn(
  column: GridColumn,
  colIndex: number,
  ctx: GridCellContext,
): TableColumn<Row> {
  // Pinned cells sit over scrolled ones; the theme's pinned background is translucent.
  const opaque = column.pinned ? ' bg-default' : '';
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
        colIndex={colIndex}
        ctx={ctx}
      />
    ),
    // UTable sets aria-sort only when this is literally true.
    enableSorting: !('render' in column && column.render),
    sortingFn: 'alphanumeric',
    sortDescFirst: false,
    enableColumnFilter: column.filter !== null,
    filterFn: column.filter === 'choice' ? 'equals' : 'includesString',
    meta: {
      class: { th: `p-0 align-top${opaque}`, td: `p-0${opaque}` },
      style: fixedWidth(column.width ?? DEFAULT_WIDTH),
    },
  };
}

/**
 * Screen order: pinned columns, the checkbox column, then the rest.
 * `thIndex(i)` is the `ordered[i]` column's position among the `th`s.
 */
function layout(columns: ReadonlyArray<GridColumn>) {
  const pinned = columns.filter((c) => c.pinned);
  return {
    ordered: [...pinned, ...columns.filter((c) => !c.pinned)],
    pinning: { left: pinned.map((c) => c.id), right: [] as Array<string> },
    pinnedWidth: pinned.reduce((sum, c) => sum + (c.width ?? DEFAULT_WIDTH), 0),
    thIndex: (i: number) => (i < pinned.length ? i : i + 1),
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
    const { ordered, pinning, pinnedWidth, thIndex } = layout(props.columns);
    const colIds = ordered.map((c) => c.id);
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
    const { focused } = useFocus(gridEl);

    /**
     * Scrolls the least distance that shows the whole cell, right of the
     * pinned columns and left of `rightInset` px.
     */
    function reveal(pos: CellPos, rightInset = 0) {
      const el = gridEl.value;
      const row = order.value.rowIds.indexOf(pos.rowId);
      const ths = el?.querySelectorAll<HTMLElement>('thead th');
      const th = ths?.[thIndex(order.value.colIds.indexOf(pos.colId))];
      if (!el || row === -1 || !th) {
        return;
      }
      const top = row * ROW_HEIGHT;
      const view = el.clientHeight - th.offsetHeight;
      el.scrollTop = Math.min(
        Math.max(el.scrollTop, top + ROW_HEIGHT - view),
        top,
      );
      if (columnsById.get(pos.colId)?.pinned) {
        return;
      }
      const width = el.clientWidth - rightInset;
      el.scrollLeft = Math.min(
        Math.max(el.scrollLeft, th.offsetLeft + th.offsetWidth - width),
        th.offsetLeft - pinnedWidth,
      );
    }

    /**
     * The cell under a viewport point, from data and header geometry: the
     * row under it may not be rendered yet. Clamped into the body, so a point
     * past an edge gives the edge's row or column.
     */
    function cellAt(el: HTMLElement, x: number, y: number): CellPos | null {
      const box = el.getBoundingClientRect();
      const ths = el.querySelectorAll<HTMLElement>('thead th');
      const head = ths[0]?.offsetHeight ?? 0;
      const rowIds = order.value.rowIds;
      const inBody = clamp(y - box.top - head, 0, el.clientHeight - head - 1);
      const rowId =
        rowIds[
          clamp(
            Math.floor((inBody + el.scrollTop) / ROW_HEIGHT),
            0,
            rowIds.length - 1,
          )
        ];
      const local = clamp(x - box.left, 0, el.clientWidth - 1);
      const pinned = local < pinnedWidth;
      const at = pinned ? local : local + el.scrollLeft;
      const col = ordered.find((c, i) => {
        const th = ths[thIndex(i)];
        return (
          Boolean(c.pinned) === pinned &&
          th.offsetLeft <= at &&
          at < th.offsetLeft + th.offsetWidth
        );
      });
      return rowId === undefined || !col ? null : { rowId, colId: col.id };
    }

    // A drag that reaches an edge scrolls, faster the further past it the
    // pointer is, and keeps the range's focus on the cell under the pointer.
    const pointer = { x: 0, y: 0 };
    useEventListener(
      window,
      'pointermove',
      (e: PointerEvent) => {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
      },
      { passive: true },
    );
    const dragScroll = useRafFn(
      () => {
        const el = gridEl.value;
        if (!el || !pressed.value || selection.state.value.editing) {
          dragScroll.pause();
          return;
        }
        const box = el.getBoundingClientRect();
        const head = el.querySelector('thead')?.offsetHeight ?? 0;
        const dy = edgeStep(
          pointer.y,
          box.top + head,
          box.top + el.clientHeight,
        );
        const dx = edgeStep(
          pointer.x,
          box.left + pinnedWidth,
          box.left + el.clientWidth,
        );
        if (dx === 0 && dy === 0) {
          return;
        }
        el.scrollTop += dy;
        el.scrollLeft += dx;
        const pos = cellAt(el, pointer.x, pointer.y);
        if (pos) {
          selection.dragTo(pos);
        }
      },
      { immediate: false },
    );
    useEventListener(gridEl, 'pointerdown', (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (e.button === 0 && (e.target as Element).closest('[role=gridcell]')) {
        dragScroll.resume();
      }
    });

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
    const dataColumns = ordered.map((column, i) =>
      dataColumn(column, thIndex(i) + 1, ctx),
    );
    const tableColumns = [
      ...dataColumns.slice(0, pinning.left.length),
      selectColumn(grid, selection),
      ...dataColumns.slice(pinning.left.length),
    ];
    props.onReady?.(grid.api);

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
        switch (e.key) {
          case 'Delete':
          case 'Backspace':
            // Swallowed even with nothing to clear: some browsers go back.
            e.preventDefault();
            grid.clearCells(selection.cells(), props.columns);
            return;
          case 'Enter':
            if (pos) {
              e.preventDefault();
              startEdit(pos, null);
            }
            return;
          default:
            if (
              pos &&
              e.key.length === 1 &&
              !e.ctrlKey &&
              !e.metaKey &&
              !e.altKey
            ) {
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

    // Paste always inserts new rows at the bottom (Tabulator's `insert`
    // action); it never writes over the selected range.
    useEventListener(gridEl, 'paste', (e: ClipboardEvent) => {
      if (fromControl(e)) {
        return;
      }
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') ?? '';
      const positional = () => parsePositionalPaste(text, props.columns);
      const ids = grid.addRows(
        props.pasteParser?.(text, positional) ?? positional(),
      );
      props.onUserEdit?.(ids);
    });

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
          columns={props.columns}
          title={props.title}
          exportFilename={props.exportFilename}
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
            virtualize={VIRTUALIZE}
            ui={TABLE_UI}
            sorting={sorting.value}
            onUpdate:sorting={(value: Sorting) => {
              sorting.value = value;
            }}
            columnFilters={columnFilters.value}
            onUpdate:columnFilters={(value: ColumnFilters) => {
              columnFilters.value = value;
            }}
            columnPinning={pinning}
            rowSelection={grid.rowSelection.value}
            onUpdate:rowSelection={(value: Record<string, boolean>) => {
              grid.rowSelection.value = value;
            }}
          />
          <EmptyState
            grid={grid}
            onActivate={() => {
              focused.value = true;
            }}
          />
          <ErrorSidebar grid={grid} onPick={showError} />
        </div>
      </div>
    );
  },
});
