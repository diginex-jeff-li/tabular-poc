/**
 * DataGrid — a spreadsheet-style grid on Nuxt UI's `UTable` (TanStack Table).
 *
 * Columns are `GridColumn`s (`zodToColumnDefs` derives them from a Zod
 * schema). Row state lives in `useDataGrid`; `rows` is the single source of
 * truth, and every person write reaches it through `grid.commit` (one undo
 * step each). Sorting and filtering are views over it: they never change row
 * ids or the order of `rows`. Active cell, range, the editing cell and a fill
 * drag live in `useGridSelection`, by row and column id. Column order,
 * visibility and widths live in `useColumnLayout`.
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
 * - A column's width is its TanStack size: fixed until a person drags its
 *   header edge, so filtering never reflows the columns.
 *
 * Keyboard and clipboard: `UTable`'s root takes focus (`tabindex=0`; a press
 * on a cell focuses it natively) and receives every key, `copy` and `paste`.
 * Each root handler first ignores events from a control inside the grid (a
 * header filter, a sort button, an open editor). Undo and redo listen on the
 * document, so they also work after a toolbar click.
 */
import UCheckbox from '@nuxt/ui/components/Checkbox.vue';
import UTable from '@nuxt/ui/components/Table.vue';
import {
  onKeyStroke,
  refAutoReset,
  useEventListener,
  useFocus,
  useRafFn,
} from '@vueuse/core';
import { ROW_HEIGHT, useDataGrid } from 'composables/useDataGrid';
import { useGridSelection } from 'composables/useGridSelection';
import { parsePositionalPaste, serializeTsv } from 'utils/gridClipboard';
import { fillRange } from 'utils/gridFill';
import { overwritePaste } from 'utils/gridPaste';
import { indexSaveErrors, validateRows } from 'utils/gridValidation';
import { appendRows } from 'utils/gridWrite';
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
import { SELECT_ID, useColumnLayout } from './useColumnLayout';
import type { EditEnd, GridCellContext } from './GridCell';
import type { ColumnDrag } from './HeaderCell';
import type { TableColumn } from '@nuxt/ui/components/Table.vue';
import type { DataGridState, Row } from 'composables/useDataGrid';
import type { GridSelection } from 'composables/useGridSelection';
import type { GridApi, GridSaveError, GridSaveResponse } from 'utils/gridApi';
import type { CellPos, Dir, GridOrder } from 'utils/gridRange';
import type { GridColumn } from 'utils/zodToColumnDefs';
import type { PropType, VNode } from 'vue';

const DEFAULT_WIDTH = 160;
const MIN_WIDTH = 60;
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
// A header-edge drag resizes live.
const SIZING = {
  enableColumnResizing: true,
  columnResizeMode: 'onChange',
} as const;
// UTable's props type has no `tabindex`; it reaches the root div via $attrs.
const FOCUSABLE = { tabindex: 0 } as const;
const getRowId = (row: Row): string => row.id;

/** Events from these belong to the control, not to the grid. */
const CONTROLS =
  'input,textarea,select,button,[role=combobox],[data-grid-editor]';
const fromControl = (e: Event): boolean =>
  (e.target as Element).closest(CONTROLS) !== null;

/** Undo/redo keys typed here keep their native meaning. */
const TEXT_CONTROLS =
  'input,textarea,select,[contenteditable=true],[role=combobox],[data-grid-editor],[role=dialog]';

/** ⌘/Ctrl+Z undoes; ⌘/Ctrl+Shift+Z and Ctrl+Y redo. */
function historyKey(e: KeyboardEvent): 'undo' | 'redo' | null {
  const key = e.key.toLowerCase();
  if ((e.metaKey || e.ctrlKey) && !e.altKey && key === 'z') {
    return e.shiftKey ? 'redo' : 'undo';
  }
  return e.ctrlKey && !e.metaKey && !e.shiftKey && key === 'y' ? 'redo' : null;
}

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

/** Where a key moves the active cell. Tab stops at the row's edge instead of wrapping to the next row. */
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
  tableApi: {
    getRowModel(): { rows: Array<{ id: string }> };
    /** Width of the left-pinned columns, resizes included. */
    getLeftTotalSize(): number;
  };
};

/** A column's width, as the th and td styles: its TanStack size. */
function sizeStyle({ column }: { column: { getSize(): number } }) {
  const width = `${column.getSize()}px`;
  return { width, minWidth: width, maxWidth: width };
}
const SIZE_STYLE = { th: sizeStyle, td: sizeStyle };

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

/** Checkbox column; the header ticks every row the filters let through. */
function selectColumn(
  grid: DataGridState,
  selection: GridSelection,
): TableColumn<Row> {
  return {
    id: SELECT_ID,
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
    enableResizing: false,
    size: SELECT_WIDTH,
    meta: {
      class: { th: 'p-0', td: 'p-0' },
      style: SIZE_STYLE,
    },
  };
}

function dataColumn(
  column: GridColumn,
  ctx: GridCellContext,
  drag: ColumnDrag,
): TableColumn<Row> {
  // Pinned cells sit over scrolled ones; the theme's pinned background is translucent.
  const opaque = column.pinned ? ' bg-default' : '';
  return {
    id: column.id,
    accessorKey: column.id,
    header: ({ header }) => (
      <HeaderCell
        header={header}
        def={column}
        drag={drag}
        onSelectColumn={() => ctx.selection.selectColumn(column.id)}
      />
    ),
    cell: ({ row }) => (
      <GridCell row={row.original} column={column} ctx={ctx} />
    ),
    // UTable sets aria-sort only when this is literally true.
    enableSorting: !('render' in column && column.render),
    sortingFn: 'alphanumeric',
    sortDescFirst: false,
    enableColumnFilter: column.filter !== null,
    filterFn: column.filter === 'choice' ? 'equals' : 'includesString',
    size: column.width ?? DEFAULT_WIDTH,
    minSize: MIN_WIDTH,
    meta: {
      class: { th: `relative p-0 align-top${opaque}`, td: `p-0${opaque}` },
      style: SIZE_STYLE,
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
    },
    /** Applied to every row that enters or is edited in the grid. */
    normalizeRow: {
      type: Function as PropType<
        (row: Record<string, unknown>) => Record<string, unknown>
      >,
    },
    /** Called with row ids after a person adds, pastes, edits or deletes rows. */
    onUserEdit: {
      type: Function as PropType<(rowIds: Array<string>) => void>,
    },
    /** Replaces the positional paste parser. */
    pasteParser: {
      type: Function as PropType<
        (
          clipboard: string,
          positional: () => Array<Record<string, unknown>>,
        ) => Array<Record<string, unknown>>
      >,
    },
  },
  setup(props) {
    const grid = useDataGrid({
      data: props.data,
      onSave: props.onSave,
      normalizeRow: props.normalizeRow,
      onUserEdit: props.onUserEdit,
    });
    const columnsById = new Map(props.columns.map((c) => [c.id, c]));
    const layout = useColumnLayout(props.columns);
    const table = shallowRef<TableHandle | null>(null);
    const gridEl = computed(() => table.value?.$el);
    // What the grid shows, in screen order: UTable's sorted and filtered
    // rows, and the visible columns in their current order.
    const order = computed<GridOrder>(() => ({
      rowIds: table.value?.tableApi.getRowModel().rows.map((r) => r.id) ?? [],
      colIds: layout.colIds.value,
    }));
    const pinnedWidth = () => table.value?.tableApi.getLeftTotalSize() ?? 0;
    const selection = useGridSelection(order);
    const sorting = ref<Sorting>([]);
    const columnFilters = ref<ColumnFilters>([]);
    // True while the primary button is held after a press on a body cell.
    // A press on a header filter, checkbox or editor never starts a drag.
    const pressed = ref(false);
    const { focused } = useFocus(gridEl);

    /** Ends a fill-handle drag, writing it as one person write. */
    function commitFill() {
      const fill = selection.endFill();
      if (fill) {
        grid.commit(
          fillRange(
            grid.rows.value,
            order.value,
            fill.source,
            fill.toRowId,
            props.columns,
          ),
        );
      }
    }
    useEventListener(window, 'pointerup', () => {
      pressed.value = false;
      commitFill();
    });

    /**
     * Scrolls the least distance that shows the whole cell, right of the
     * pinned columns and left of `rightInset` px.
     */
    function reveal(pos: CellPos, rightInset = 0) {
      const el = gridEl.value;
      const row = order.value.rowIds.indexOf(pos.rowId);
      const th =
        el?.querySelectorAll<HTMLElement>('thead th')[
          layout.thIndex(pos.colId)
        ];
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
        th.offsetLeft - pinnedWidth(),
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
      const pinned = local < pinnedWidth();
      const at = pinned ? local : local + el.scrollLeft;
      const colId = order.value.colIds.find((id) => {
        const th = ths[layout.thIndex(id)];
        return (
          Boolean(columnsById.get(id)?.pinned) === pinned &&
          th.offsetLeft <= at &&
          at < th.offsetLeft + th.offsetWidth
        );
      });
      return rowId === undefined || !colId ? null : { rowId, colId };
    }

    // A drag (range or fill handle) that reaches an edge scrolls, faster the
    // further past it the pointer is, and keeps the drag on the cell under
    // the pointer.
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
          box.left + pinnedWidth(),
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
      const target = e.target as Element;
      if (
        e.button === 0 &&
        target.closest('[role=gridcell]') &&
        !target.closest('input,button,[role=checkbox],[data-grid-editor]')
      ) {
        pressed.value = true;
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
      colIndex: (colId) => layout.thIndex(colId) + 1,
    };
    const tableColumns = [
      ...props.columns.map((column) => dataColumn(column, ctx, layout.drag)),
      selectColumn(grid, selection),
    ];
    props.onReady?.(grid.api);

    function navigate(e: KeyboardEvent, dir: Dir) {
      const tab = e.key === 'Tab';
      if (!selection.active.value) {
        const first = order.value.rowIds[0];
        const firstCol = order.value.colIds[0];
        if (!tab && first !== undefined && firstCol !== undefined) {
          e.preventDefault();
          selection.select({ rowId: first, colId: firstCol });
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
          case 'Escape':
            // Nothing selected: the next paste appends rows.
            selection.clear();
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

    // On the document, so undo also works after a toolbar click. Inside a
    // text field, an open editor or a dialog the keys stay native.
    onKeyStroke(true, (e: KeyboardEvent) => {
      const step = historyKey(e);
      if (!step || (e.target as Element).closest?.(TEXT_CONTROLS)) {
        return;
      }
      e.preventDefault();
      if (step === 'undo') {
        grid.undo();
      } else {
        grid.redo();
      }
    });

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

    // With a range, paste writes over the grid from its top-left cell, as
    // in Excel. With nothing selected (or no rows) it appends new rows, via
    // the page's `pasteParser` when it has one.
    useEventListener(gridEl, 'paste', (e: ClipboardEvent) => {
      if (fromControl(e)) {
        return;
      }
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') ?? '';
      const origin = selection.cells()[0]?.[0];
      if (origin) {
        grid.commit(
          overwritePaste(
            grid.rows.value,
            order.value,
            origin,
            text,
            props.columns,
          ),
        );
        return;
      }
      const positional = () => parsePositionalPaste(text, props.columns);
      grid.commit(
        appendRows(
          grid.rows.value,
          props.pasteParser?.(text, positional) ?? positional(),
        ),
      );
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
      if (order.value.colIds.includes(pos.colId)) {
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
          columnMenu={layout.menu.value}
          onToggleColumn={layout.setVisible}
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
            columnPinning={layout.pinning}
            columnOrder={layout.columnOrder.value}
            onUpdate:columnOrder={(value: Array<string>) => {
              layout.columnOrder.value = value;
            }}
            columnVisibility={layout.columnVisibility.value}
            onUpdate:columnVisibility={(value: Record<string, boolean>) => {
              layout.columnVisibility.value = value;
            }}
            columnSizing={layout.columnSizing.value}
            onUpdate:columnSizing={(value: Record<string, number>) => {
              layout.columnSizing.value = value;
            }}
            columnSizingOptions={SIZING}
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
          <ErrorSidebar
            grid={grid}
            onPick={showError}
            rowNumber={(rowId: string) => {
              const index = order.value.rowIds.indexOf(rowId);
              return index === -1 ? null : index + 1;
            }}
          />
        </div>
      </div>
    );
  },
});
