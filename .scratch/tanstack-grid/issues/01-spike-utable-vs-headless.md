# 01 Spike: UTable or headless useVueTable

Status: ready-for-agent
Type: prototype
Spec: `../spec.md` (decision 7)

## Question

Can Nuxt UI `UTable` (4.13.1) host a spreadsheet-style grid, or do we need `useVueTable` with our own markup?

## Prove in a throwaway page (`/spike-grid`, deleted after)

With the compliance seed data:
1. **Cell control**: a pointerdown/pointerenter handler that covers the whole cell area (no dead padding), plus `data-row-id` / `data-col-id` on each cell. Try `meta.class.td` set to `p-0` plus a full-size wrapper in the cell render.
2. **Pinned column + sticky header + `virtualize`** all at once, with 2,000 rows and horizontal scroll.
3. **Focus**: the table root takes focus (`tabindex=0`) and receives `keydown`, `copy` and `paste`, including with no rows.
4. **An editor in a cell** (`UInput`, `USelectMenu`) opens and closes without rebuilding every row (watch Vue devtools render counts).
5. **Header slot** holding a sort button and a filter input that don't trigger column selection.

## Answer format

A table of the 5 checks with pass/fail and the code used. Recommend `UTable` or headless. If headless, list which Nuxt UI pieces we still reuse (checkbox, input, select, theme tokens).

## Acceptance

- The recommendation is written under `## Answer` and copied into `spec.md` decision 7.
- The spike page is removed.

## Answer

**Use `UTable`.** All 5 checks passed in a real browser (omp headless Chromium, dev server, 2,000 compliance seed rows, `UTable` 4.13.1). The fallback condition in spec decision 7 did not occur. The spike page `/spike-grid` is deleted.

Spike setup: the 10 compliance seed rows repeated 200 times with ids `r0`…`r1999`, a pinned `__select` checkbox column, 8 data columns, `sticky`, `virtualize`, and controlled `sorting`, `columnFilters`, `columnPinning` and `rowSelection`. Counters in the cell render functions were read through `window.__spike`.

### Checks

| # | Check | Result | Code used | Evidence (measured) |
|---|---|---|---|---|
| 1 | Pointer handlers on the whole cell area, `data-row-id`/`data-col-id` per cell | Pass | `meta.class.td: 'p-0 h-px'` plus a `flex h-full items-center px-3 py-2` wrapper `div` in the cell render that carries the data attributes and the `onPointerdown`/`onPointerenter` handlers | `elementFromPoint` at 561,291 points inside 108 cells (12 rows by 9 columns, 1px in from each edge): 0 misses. A real mouse press 2px from the bottom-right corner of `r2/topic`, inside the old `p-4` padding, fired `pointerdown:r2:topic`. Dragging to `r4/riskLevel` fired `pointerenter` for `r3:topic`, `r3:riskLevel` and `r4:riskLevel`. The 1px row border is shared by two rows (`border-collapse: collapse`), so a hit exactly on it resolves to the neighbouring row or to the `tr` |
| 2 | Pinned column, sticky header and `virtualize` together, 2,000 rows, horizontal scroll | Pass | `sticky`, `virtualize={{ estimateSize, overscan: 8 }}`, `columnPinning={{ left: ['__select'], right: [] }}`, `getRowId={(r) => r.id}` | 25 to 35 `tr` in the DOM at any time. At `scrollTop` 39,964 and `scrollLeft` 600, the header top and the pinned `th`/`td` left edges stayed 1px inside the root (its border). A hit test on the pinned cell returned `r978:__select`, so the pinned column paints above scrolled cells. At the bottom, row `r1999` rendered. A row scrolled under the header hit the pinned `th`, so the header paints above the body |
| 3 | Root takes focus and receives `keydown`, `copy`, `paste`, including with no rows | Pass | `tabindex={0}`, `role`, `onKeydown`, `onCopy`, `onPaste` passed straight to `UTable`. They land on its root `div` through `$attrs` | Clicking a cell made the root `document.activeElement`. Key events sent through CDP (`tab.press`) reached the handlers: `ArrowDown`, `Meta+C` fired a native `copy`, `Meta+V` fired a native `paste` carrying the clipboard text. With `rows = []`, clicking the "No data" cell and clicking the blank area below it both focused the root, and `ArrowDown`, `Meta+V` and `Meta+C` all reached the handlers |
| 4 | `UInput` and `USelectMenu` editors open and close without rebuilding every row | Pass | Cell render returns `h(GridCell, { row: row.original, colId })`. `GridCell` reads the editing state through its own `computed(() => editing.value?.rowId === props.row.id && …)` | See the render counts below |
| 5 | Header holds a sort button and a filter input that don't select the column | Pass | `columnDef.header` renders a `HeaderCell` component. Its root `onPointerdown` returns early when `e.target.closest('button,input,[role=combobox]')` matches. Sort button: `column.toggleSorting(undefined, false)`. Filter: `UInput` bound to `column.getFilterValue()`/`setFilterValue(v \|\| undefined)`, `filterFn: 'includesString'` | Three sort clicks on Topic gave asc, then desc, then none, with no column selection. Typing `Env` in the Category filter cut 2,000 rows to 200 with no column selection. A click on the header title selected `topic`. A click 2px from the bottom-right corner of the Issue `th` selected `issue` |

Render counts for check 4 (deltas per step; "cell fn" is a call of the column's `cell` function, which means `FlexRender` re-rendered):

| Step | `GridCell` renders | cell fn calls | Header renders | Page renders |
|---|---|---|---|---|
| Double-click opens `UInput` (focus lands in the input) | 1 | 0 | 0 | 0 |
| Escape closes | 9 | 8 | 0 | 0 |
| Type 12 characters | 0 | 0 | 0 | 0 |
| Enter commits (data write) | 9 | 216 | 0 | 0 |
| Double-click opens `USelectMenu` (options High, Medium, Low) | 3 | 0 | 0 | 0 |
| Pick "Low" commits and closes the menu | 10 | 216 | 0 | 0 |
| Same cell variant, reading `editing.value` directly in the column `cell` function: open, then close | 216, 216 | n/a | 0 | 0 |

The 9 and 8 counts on close are a new row mounting. The open editor made its row taller, the virtualizer measured it, and one row left the window. On close the row shrank back and one row (8 `GridCell`s) mounted again. 216 is every visible data cell: 27 rows by 8 columns.

### Patterns for tickets 02 to 11

Everything below ran in the spike unless it is marked inferred.

Cell with full-area pointer control (02, 05, 06). The `td` takes only `class`, `style`, `colspan` and `rowspan` from `meta`. Data attributes and handlers go on the wrapper:

```tsx
const GridCell = defineComponent({
  props: { row: { type: Object as PropType<Row>, required: true }, colId: { type: String, required: true } },
  setup(props) {
    const isEditing = computed(() => editing.value?.rowId === props.row.id && editing.value?.colId === props.colId);
    return (): VNode => (
      <div
        data-row-id={props.row.id}
        data-col-id={props.colId}
        class="flex h-full items-center px-3 py-2"
        onPointerdown={…}
        onPointerenter={…}
        onDblclick={…}
      >
        {isEditing.value ? <Editor /> : String(props.row[props.colId] ?? '')}
      </div>
    );
  },
});

const column: TableColumn<Row> = {
  id: field,
  accessorKey: field,
  enableSorting: true, // UTable sets aria-sort only when this is literally true
  cell: ({ row, column }) => h(GridCell, { row: row.original, colId: column.id }),
  header: ({ column }) => h(HeaderCell, { column, title }),
  meta: { class: { td: 'p-0 h-px', th: 'p-0 align-top' } },
};
// Pinned column (invite Status, P17): opaque background, the theme default is bg-default/75.
meta: { class: { td: 'p-0 h-px bg-default', th: 'p-0 bg-default' } }
```

`TableColumn` comes from `@nuxt/ui/components/Table.vue` (its `.d.ts` exports it, and `package.json` exports `./components/*`; not typechecked in the spike). `@tanstack/vue-table` is not resolvable from `frontend/apps/admin` (pnpm keeps it under `@nuxt/ui`), so don't import it directly. The same applies to augmenting TanStack's `ColumnMeta` with our own editor fields [inferred]. Keep editor kind and options in our own column model and close over them in `cell`.

Grid root, focus and scroll container (03, 06, 07, 11). `UTable`'s root `div` gets every non-prop attribute. It is also the scroll container that `virtualize` uses, and the element that `defineExpose` returns as `$el`:

```tsx
const VIRTUALIZE = { estimateSize: ROW_HEIGHT, overscan: 8 } as const; // hoisted: a new object each render is a changed prop
// Exposed by UTable: $el (root div, scroll container, focus target), tableRef (<table>), tableApi (TanStack table)
const tableRef = ref<{ $el: HTMLElement; tableRef: HTMLTableElement; tableApi: { getRowModel(): { rows: Array<{ id: string }> } } } | null>(null);
const gridEl = computed(() => tableRef.value?.$el);

<UTable
  ref={tableRef}
  tabindex={0}
  data={rows.value}
  columns={columns} // built once, never inside render
  getRowId={(r: Row) => r.id}
  sticky
  virtualize={VIRTUALIZE}
  sorting={sorting.value}
  onUpdate:sorting={(v: SortingState) => (sorting.value = v)}
  columnPinning={columnPinning.value}
  onUpdate:columnPinning={…}
/>
// onKeyStroke(true, onKey, { target: gridEl }); useEventListener(gridEl, 'paste', onPaste); useEventListener(gridEl, 'copy', onCopy)
```

Each controlled state (`sorting`, `columnFilters`, `rowSelection`, `columnPinning`) needs a defined starting value. `UTable` decides once at setup whether a model is controlled (`!== undefined`).

Events from header filters and cell editors bubble to the root. The spike logged `keydown:E:INPUT` from the Category filter. Copy and paste bubble the same way [inferred from the DOM event model, not run]. Every root handler, not only `keydown`, must bail out first:

```ts
if ((e.target as Element).closest('input,textarea,select,[role=combobox],[data-grid-editor]')) return;
```

Scroll to a row (05, 11). `UTable` doesn't expose its virtualizer. With fixed-height rows and `estimateSize` equal to the real row height, this puts the row directly under the sticky header. The spike measured a 0 to 0.5px offset for rows 42, 700, 1234 and 1500 at 37px:

```ts
const index = tableRef.value!.tableApi.getRowModel().rows.findIndex((r) => r.id === rowId);
gridEl.value!.scrollTop = index * ROW_HEIGHT;
// wait for the virtualizer to render (2 to 4 animation frames in the spike), then
gridEl.value!.querySelector(`[data-row-id="${rowId}"][data-col-id="${colId}"]`);
```

With `estimateSize` 41 against real 37px rows, the same code missed by 95 to 220px. Measured rows and estimated rows mix in the virtualizer's offsets.

### Gotchas for later tickets

- **Row height must stay fixed (05, 11).** An open `UInput` editor made its row taller, and the window lost a row. Keep editors inside the row height (`size="xs"`, no wrapper padding) so the scroll math above stays exact.
- **Interaction state must be read per cell (05, 06).** A `computed` inside the cell component re-renders 1 cell per editor toggle. Reading `editing.value` in the column `cell` function re-rendered all 216 visible cells. The same applies to the active cell, the range and the validation classes. A function in `meta.class.td` runs inside the row render, so reactive reads there subscribe whole rows [inferred from the source].
- **Commit cost (04, 05).** With `UTable`'s default `watchOptions: { deep: true }`, one in-place cell write took a median of 68ms. Replacing the array took 51ms. Each re-ran 216 cell functions. With `watchOptions={{ deep: false }}`, an in-place write took 4ms and re-ran 0 cell functions. The cell updated through Vue reactivity, but TanStack's sorted and filtered rows don't see the edit until `rows` is replaced (36ms). These are medians of 11 runs on a dev build, timed from the write to the next macrotask, against a 0.1ms baseline. I didn't profile the limiter. I infer it is the TanStack row-model rebuild over 2,000 rows plus the 216 cell function calls. Ticket 04 picks the write strategy.
- **Page re-renders patch `UTable` (02, 04).** Re-rendering the page that holds `UTable` took 7 to 12ms with 0 cell or header re-renders. Keep toolbar state, such as the dirty count and the "Saved N" badge, out of the render function that renders `UTable`, or accept the cost.
- **Column widths follow content (02).** The table lays out with automatic widths. Filtering to "Env" narrowed the Issue column (screenshot). With varied real data, widths may also shift while scrolling, because only rendered rows count [inferred, the seed data repeats so the spike couldn't show it]. Set widths through `meta.style.th`/`td`.
- **Translucent theme backgrounds (02, 10).** Pinned cells default to `bg-default/75` and the sticky header to `bg-default/75 backdrop-blur-sm`, so content shows through. Override the pinned column with `bg-default`, and the header with `ui={{ thead: 'bg-default' }}` if needed. Don't put `relative` in a pinned column's `meta.class.td`. `tailwind-merge` may let it replace `sticky` [inferred].
- **Don't pass `onSelect` or `onHover` (06).** In `UTable`, `onSelect` gives every `tr` a `tabindex`, and its click handler calls `preventDefault` and `stopPropagation` [read in the source].
- **Table-level `meta` is read once (05).** `UTable` passes `meta: meta.value` to `useVueTable` at setup, so changing `meta` later has no effect [read in the source]. Column `meta` is reactive.
- **Accessibility (06).** `role="grid"` on the root `div` produced the tree grid, then table, then rows, because the native `<table>` keeps its own role. Setting `role="grid"` on the exposed `tableRef` (the `<table>`) with a DOM write produced grid, row, gridcell and columnheader. In the app that write goes in `onMounted`; Vue leaves attributes it doesn't bind alone [inferred]. `UTable` offers no way to set `aria-selected` or other attributes on a `tr` or `td`. Focus stays on the root `div`. Ticket 06 chooses between `aria-activedescendant` and roving focus with this limit.
- **Preventing text selection during drag (06).** Calling `preventDefault` on `pointerdown` or `mousedown` stops the browser from focusing the root, so call `gridEl.focus()` in the same handler [inferred, not run].

### Why not headless

Headless `useVueTable` with our own markup would remove the accessibility limit and give direct access to the virtualizer (`scrollToIndex`). It would not remove most of the commit cost. Replacing the array cost 36ms even with `UTable`'s deep watch off, which points at TanStack's row-model rebuild rather than `UTable` [inferred]. It would cost a direct `@tanstack/vue-table` and `@tanstack/vue-virtual` dependency, our own sticky, pinning and virtualizer layout, and our own theme classes. None of the 5 checks needed it. If ticket 06 finds that the accessibility limit blocks parity, revisit this there. A headless grid would still reuse `UCheckbox`, `UInput`, `USelectMenu`, `USelect`, `UButton` and the theme tokens (`bg-default`, `border-default`, `text-muted`, `bg-elevated`).
