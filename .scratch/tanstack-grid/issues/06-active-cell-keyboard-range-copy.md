# 06 Active cell, keyboard navigation, range selection, copy

Status: ready-for-agent
Blocked by: 05
Parity: P11, P12

## Change

- `utils/gridRange.ts` (pure): positions are `{ rowId, colId }`. A range is anchor + focus resolved against the **visible** order, meaning the current sorted and filtered row ids and the visible column ids. Exports `move(pos, dir, order)`, `extend(range, dir, order)`, `cellsIn(range, order)`, `rowRange(rowId)`, `colRange(colId)`.
- `composables/useGridSelection.ts`: holds the active cell and range; handles `keydown` (arrows, Tab/Shift+Tab, Shift+arrows, Home/End, Enter to edit) on the focused grid root; pointerdown/pointerenter for drag; Shift+click; header and row-number clicks for whole column or row.
- If sort or filter hides the anchor, the range drops back to the nearest visible cell. Deleted rows drop out of the range.
- `copy` on the grid root writes `serializeTsv(cellsIn(range))`, with no headers.
- Accessibility: `role="grid"`, `aria-rowindex`/`aria-colindex`, `aria-selected` on range cells, one tab stop (roving `tabindex`).

## Acceptance

- `gridRange.test.ts`: moves clamp at the edges; extending over a filtered view skips hidden rows; `cellsIn` returns row-major order.
- Real-browser check (CDP key presses, not synthetic events): click a cell → arrows move → Shift+arrows grow the range → Cmd/Ctrl+C → the clipboard holds the TSV block.
- Typing in a header filter or an open editor never moves the active cell.

## VueUse (spec decision 8)

- Keys: one `onKeyStroke(true, onGridKey, { target: gridEl })`, a `switch` on `e.key`, no `dedupe` (held arrows repeat). The first line bails out on `e.target.closest('input,textarea,select,[role=combobox],[data-grid-editor]')`. Arrows, Home/End and Tab call `preventDefault()`. `target` accepts the `UTable` component ref (`unrefElement` resolves `$el`).
- Copy: `useEventListener(gridEl, 'copy', e => { e.clipboardData.setData('text/plain', tsv); e.preventDefault(); })`. Not `useClipboard`, which is async, permission-gated and can't fill the event payload. **Unverified**: that a focused non-editable root receives `copy` with a writable payload in every target browser. The real-CDP acceptance check proves it.
- Focus: `useFocus(gridEl)` for the ring and roving owner, `useFocusWithin(gridEl)` for "an editor or filter inside is focused".
- Drag: `useMousePressed({ target: gridEl, touch: false, drag: false })` for held/released (window mouseup included), plus a `pointerenter` on each cell for the id.
- Edge auto-scroll: `useRafFn(step, { immediate: false })`, resumed near an edge and paused on leave/release, plus `useScroll(gridEl, { observe: { mutation: true } })` (writable `y`).
- Rejected: `useMagicKeys`, `useKeyModifier`, `usePointer`, `useElementByPoint`, `useTextSelection` (see spec).

## Pure module (done)

`utils/gridRange.ts` (tests: `gridRange.test.ts`) and `serializeTsv` in `utils/gridClipboard.ts` (tests: `gridClipboard.test.ts`). Not wired yet.

```ts
type CellPos = { rowId: string; colId: string };
type GridOrder = { rowIds: ReadonlyArray<string>; colIds: ReadonlyArray<string> }; // visible, screen order
type Range = { anchor: CellPos; focus: CellPos };
type Dir = 'up' | 'down' | 'left' | 'right' | 'home' | 'end' | 'top' | 'bottom';
move(pos: CellPos, dir: Dir, order: GridOrder): CellPos
extend(range: Range, dir: Dir, order: GridOrder): Range
cellsIn(range: Range, order: GridOrder): Array<Array<CellPos>> // row-major: one array per row
rowRange(rowId: string, order: GridOrder): Range | null
colRange(colId: string, order: GridOrder): Range | null
reconcile(range: Range, prev: GridOrder, next: GridOrder): Range | null
serializeTsv(rows: ReadonlyArray<Row>, cells: ReadonlyArray<ReadonlyArray<CellPos>>, columns: ReadonlyArray<GridColumn>): string
```

- **Tab does not wrap.** Measured on the Tabulator grid with real key presses: Tab on the last column stays put, Shift+Tab on the first data column stays put. Tabulator's range mode maps Tab to `right` and Shift+Tab to `left`, both clamped (`SelectRange.keyNavigate`); the row-wrapping `Edit.navigateNext` only runs while an editor is open. So the composable maps Tab → `right`, Shift+Tab → `left`.
- `home`/`end` = first/last column of the row, `top`/`bottom` = first/last row of the column (for Ctrl/Cmd+arrows). Tabulator's Home/End only scroll; Ctrl+arrow there is a data-aware jump, not ported.
- `move`/`extend` return the same object when nothing moves, so a `shallowRef` assignment doesn't trigger. `move` on a cell that isn't visible returns it unchanged: `reconcile` first.
- `reconcile` takes `prev` as well as `next` (deviation from the brief's `reconcile(range, order)`): "nearest visible cell" needs to know where the vanished cell was. Use it from `watch(order, (next, prev) => …)`. A vanished anchor collapses the range to the row that slid into its place (else the closest before it); a vanished focus moves only the focus; returns `range` itself when nothing vanished, null when no cell is left. A sort that keeps both ends visible keeps the range by id, so it may cover different rows than before (Tabulator keeps screen positions instead).
- `serializeTsv` copies only columns with `paste: true`, matching Tabulator, whose range copy drops `clipboard: false` columns (`Export.columnVisCheck`). Status and `__select` never reach the clipboard, and a copied block pastes back positionally. Values with a tab, line break or `"` are quoted with doubled quotes; rows joined by `\n`.

## Done

Built with ticket 05. Under `frontend/apps/admin/src/`:
- `composables/useGridSelection.ts`: one `shallowRef<GridInteraction>` holding `{ range: Range | null; editing: { pos, seed } | null }`, all by id. The active cell is `range.anchor`, so there is no separate `active` field that could drift. One selected cell is a range with anchor = focus. API: `select(pos, extend)`, `dragTo`, `step(dir, extend)` (a plain move collapses the range and moves from the active cell, as Excel does), `selectRow`, `selectColumn`, `startEdit`, `stopEdit`, `cells()`, and per-cell `isActive`/`isSelected`/`isEditing` (`isSelected` uses row/column `Set`s derived from `cellsIn`). A no-op keeps the state object, so nothing re-renders. `watch(order, (next, prev) => reconcile…)` refits the range and ends an edit whose row left the view.
- `DataGrid.tsx`: `order` = `tableApi.getRowModel().rows` ids (sorted + filtered) + data column ids. One `onKeyStroke(true, …, { target: gridEl })` bails out on `input,textarea,select,button,[role=combobox],[data-grid-editor]`, then routes a key through a `Dir` table: arrows (Ctrl/Cmd+arrow → `top`/`bottom`/`home`/`end`), Home/End, Tab/Shift+Tab (`right`/`left`), Shift extends. Its `switch` has Enter (edit), a `Delete`/`Backspace` case left for ticket 08, and the printable-key default (edit with the key as seed). The paste listener slot for ticket 07 is a comment beside the copy listener. Copy is `useEventListener(gridEl, 'copy')` writing `serializeTsv(rows, selection.cells(), columns)`. Drag is `useMousePressed({ target: gridEl, touch: false, drag: false })` plus each cell's `pointerenter` (ignored while editing). Moves keep the moving end in view with row-index math (`scrollTop` clamped to `[top + ROW_HEIGHT − view, top]`, which works under virtualization) and the column's `th` offsets for horizontal.
- Whole column: a press on the header outside its sort button and filter (`HeaderCell` `onSelectColumn`). Whole row: a press in the checkbox column's cell outside the checkbox (`SelectCell`). There is no row-number column.
- Focus: `UTable` root `tabindex=0` (spread through `$attrs`; its props type has no `tabindex`). Cells don't call `preventDefault` on `pointerdown`. A press on a non-focusable cell focuses the root natively, and `select-none` on cells and headers stops text selection while dragging. An edit ended by keyboard or a pick gives focus back to the root after the editor unmounts.
- Accessibility: `role="grid"` and `aria-multiselectable="true"` are set on `UTable`'s `<table>` in `onMounted`. The `GridCell` wrapper `div` carries `role="gridcell"`, `aria-selected`, `aria-colindex` (1-based, checkbox column = 1) and `aria-invalid`, with two oxlint disables that state why. Chrome's tree (measured): grid (multiselectable) → row → gridcell (`td`) → gridcell (wrapper, `selected`). So the gridcell is nested, because `UTable` binds no attributes on `td`. Focus stays on the root, which is one tab stop. There is no roving tabindex and no `aria-activedescendant` (the root is a generic `div`, not a composite role), and no `aria-rowindex` (it belongs on `tr`). A screen reader hears selection state but not the active-cell moves. Closing that gap means headless markup or a live region, not parity.

Deviations:
- Tab at the row's edge leaves the grid (no `preventDefault`) instead of staying put as Tabulator does. Otherwise Tab and Shift+Tab trap keyboard focus (WCAG 2.1.2). Tab inside an open editor commits and clamps as specified.
- An arrow, Home or End with no active cell selects the first visible cell, so the grid works from the keyboard alone.
- A save-error cell shows `bg-error/10` instead of the range tint when both apply.

Evidence (2026-11-25):
- `useGridSelection.test.ts` (8): edge clamping, Shift growth then collapse from the active cell, Shift-click/drag keep the anchor, row/column ranges, no keys before a cell is active, editing makes the cell active, a filtered-out row refits to the row that slid in and ends its edit, no-ops keep the state object. `DataGrid.test.ts`: arrows + Shift give `r2:topic, r2:risk, r3:topic, r3:risk` (`aria-selected`). ArrowDown and `x` typed in the Topic filter neither move the active cell nor open an editor. A press on the header title selects the whole column.
- Browser `/next` (omp headless Chromium; mouse and keys are real CDP input through `tab.click`/`tab.press`/`page.mouse`/`page.keyboard`; DOM state and the clipboard were read with `evaluate`; clipboard permission granted with `overridePermissions`): click Compliance Category row 1, ArrowDown, ArrowRight → active `topic@1`. Shift+ArrowDown, Shift+ArrowRight → 4-cell range. Meta+C → `navigator.clipboard.readText()` = `Key Compliance Requirements\tMedium\nZero Tolerance Policy\tHigh`. A whole-row press beside the checkbox → 8 cells selected and 0 rows ticked. Meta+C there = the row's 8 values tab-joined, with an empty trailing Best Practice. Typing `lab`, ArrowLeft, ArrowDown, Home, Backspace in the Issue filter left the active cell on the same row (the filter value stayed `lab`, 2 rows). Tab → Issue, Shift+Tab ×2 → Topic, End → Best Practice, Home → Category Code, Meta+ArrowDown → last row. A mouse drag from row 1 Category Code to row 3 Topic (12 move steps) gave a 3×3 range. Shift+click gave a 3×2 range anchored on the first cell. A header title click selected all 10 cells of Closure Timing. No console errors or warnings.
- Re-renders (temporary `GridCell` render counter, since removed; 80 visible cells): click a cell 1, ArrowDown 2, ArrowRight 2, Shift+ArrowDown 1, ArrowUp (collapse a 2-cell range) 3, double-click opens the text editor 3 (2 for the move + 1), typing 5 characters 0, Escape 1, Enter opens 1, Enter commits an unchanged value and moves 2, double-click opens the choice editor 4, Escape closes it 2. A changed value: Enter commit 9 (the replaced row's 8 cells + 1 for the move), choice pick 13 (that row's 8 + the move + editor open/close).
