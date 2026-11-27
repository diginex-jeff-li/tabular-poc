# 17 Column resize, reorder, hide

Status: resolved
Spec: `../spec.md` "Phase 2", decision 6, P24

## Change

- **TanStack:** use `UTable`'s `columnSizing`, `columnOrder` and `columnVisibility` state.
  - Resize: drag the header's right edge.
  - Reorder: drag the header. The pinned Status column and the checkbox column stay first.
  - Hide/show: a column menu in the toolbar (`UDropdownMenu` with checkboxes).
  - Range selection, keyboard moves, copy, paste and fill follow the visible column order.
  - Layout state lives in the component and is lost on reload.
- **Tabulator:** column resize (on by default), `movableColumns: true`, and the same hide/show menu over `column.hide()`/`show()`. Frozen Status stays first.

## Acceptance

- Unit tests (TanStack): after reorder or hide, arrows, copy and paste follow the visible order; a hidden column is never written by paste or fill.
- Real browser, all four routes: resize, drag a column, hide and show a column; a reload restores the default layout.

## Done (TanStack)

Built 2026-11-26. Under `frontend/apps/admin/src/`:
- `components/ColumnVisibilityMenu/` (shared with the Tabulator engine): a "Columns" `UDropdownMenu` of checkbox items; a `locked` column is disabled; the menu stays open while toggling.
- `components/DataGrid/useColumnLayout.ts`: `columnOrder`, `columnVisibility`, `columnSizing` refs passed to `UTable` (controlled, so they must be defined from setup; `UTable` wires the change handlers only for models defined at setup). Order starts `[pinned…, __select, rest…]`; only unpinned data columns move, so Status and the checkbox stay first. `colIds` (visible data columns in screen order) is the grid's `order.colIds`, so range, keys, copy, paste and fill follow it; `thIndex` replaces the fixed index map in `reveal`/`cellAt` and drives `aria-colindex`. Header reorder is pointer-based: a press on a movable header's free area, 4px of travel, release over another movable header → the column takes that header's slot; the target shows a 3px primary bar.
- Widths: each column has TanStack `size` (its old fixed width), `minSize` 60; `meta.style` reads `column.getSize()`. `HeaderCell` has a resize strip on its right edge (`header.getResizeHandler()`, `columnResizeMode: 'onChange'`); double-click resets the width. Pinned width comes from `getLeftTotalSize()`, so a resized Status still pins correctly.
- All layout state lives in the component: a reload restores the default.

Parity notes for the lead:
- The checkbox column is not in the menu, can't be resized, moved or hidden. Status is listed but locked, can be resized, can't be moved.
- Hiding keeps the column's width and slot; showing puts it back where it was.
- Header drag only moves on release over another header (no live column shuffling while dragging).

Evidence:
- `DataGrid.test.ts`: Topic header dragged onto Risk → header order `risk, topic`, Topic cells `aria-colindex` 3, Shift+ArrowRight from Risk + copy → `Low\tChild labor`, paste `High\tFire` writes Risk then Topic. Topic hidden through the real menu: gone from the body, Shift+ArrowLeft from Risk stays, copy → `Low`, paste `High\tFire` and a fill write Risk only; shown again, Topic values are unchanged.
- Browser, real CDP mouse. `/`: Topic right edge dragged +80px → `th` and cells 240 → 320px; Risk Level header dragged onto Compliance Category → order `categoryCode, riskLevel, complianceCategory, topic…`; from Category Code, ArrowRight ×2 lands on Compliance Category (visible order); Columns → Topic → hidden, menu still open, Topic again → back in its slot at 320px; reload → default order and widths. `/invite-users`: Last Name dragged onto Email → `status, __select, lastName, email, …`; dragging Status 300px does nothing; the menu lists `Status(locked), Email, First Name, Last Name, Role, Groups`.

## Done (Tabulator)

Built 2026-11-26. `composables/useGridEditor.ts` and `components/GridEditor/GridEditor.tsx`:
- Resize: Tabulator's default header-edge resize (unchanged).
- Reorder: `movableColumns: true`. Frozen Status can't move. Tabulator lets a column land before `__select`, so `columnMoved` → `keepCheckboxFirst` moves the checkbox back after the frozen columns. Measured: a drop 20px into the checkbox header gave `topic, __select, …` and the guard restored `__select, topic, …`.
- Hide/show: the shared `ColumnVisibilityMenu` in the toolbar between Delete and Export, behind a divider. Items are the definition's visible titled columns except `__select`, with Status locked. `setColumnVisible` calls `column.show()`/`hide()`.
- Range, keys, copy, overwrite paste, append paste and fill follow Tabulator's visible column order, because `gridOrder`/`writableColumns`/positional paste read `getColumns()` filtered by `isVisible()`.
- No persistence: a reload restores the default layout.

Parity notes:
- Tabulator shuffles columns live while dragging. TanStack moves only on release.
- The checkbox column is resizable on Tabulator (column default) [inferred, not tested]; TanStack's isn't.
- The menu's place in the toolbar may differ from DataGrid's [not compared].

Evidence:
- `useGridEditor.test.ts`: menu items (Status locked, `__select` and the hidden `id` left out); `setColumnVisible` hides/shows and updates the item; a column moved to the front puts `__select` back first; with frozen Status the order stays `status, __select`; a paste skips a hidden column. `GridEditor.test.ts`: the menu gets `columnItems` and its toggle reaches `setColumnVisible('issue', false)`.
- Browser, real CDP mouse. `/tabulator`: Topic right edge dragged +80px → 239 → 320px. Risk Level dragged onto the checkbox header → `__select, riskLevel, categoryCode, …`; click the first data cell, ArrowRight → `categoryCode` (visible order). Columns → Topic → hidden (`display: none`, menu item unchecked); paste over the gap skips it; Topic shown again; reload → default order and 239px. `/tabulator/invite-users`: Last Name dragged onto Email → `status, __select, lastName, email, …`; dragging onto Status does nothing; the menu lists `Status (locked), Email, First Name, Last Name, Role, Groups`; reload → default order.

## Lead follow-up (parity gaps closed)

- Tabulator: ticking a row checkbox no longer turns into a whole-row range. The mousedown never reaches Tabulator's range module, and focus goes back to the grid after the tick. Checked in the browser on `/tabulator`:
  - with row 3's Issue cell selected, ticking row 1 and pasting overwrote row 3's Issue, as on TanStack;
  - with nothing selected, ticking row 1 and pasting appended row 11, as on TanStack.
- Tabulator: with nothing selected, an arrow/Home/End key selects the first data cell (Category Code), as on TanStack. Checked in the browser on both engines.
- Tabulator: the checkbox column is no longer resizable, as on TanStack.
- Still different, all cosmetic:
  - undo of a reload-type write (Add Row, Delete, Clear, appended paste) shrinks Tabulator's selection to one cell;
  - Tabulator's fill handle doesn't auto-scroll at the edge (read in the source, not tested);
  - Tabulator moves a column live while dragging, TanStack on drop.
