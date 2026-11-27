# 05 Inline editing, validation highlight, error sidebar

Status: resolved
Blocked by: 03, 04
Parity: P8, P9, P10

## Change

- One editing cell at a time, held as `editing: { rowId, colId, draft } | null`. Text cells use `UInput`; choice cells use `USelectMenu` over `meta.options`, open on start and showing the current value (fixes the empty Tabulator list editor).
- Ways to start editing: double-click, Enter, or typing a printable character (replaces the value, as in Excel). Escape cancels. Enter commits and moves down; Tab commits and moves right; blur commits.
- On commit, the row is rebuilt as `normalizeRow({ ...row, [col]: draft })`, then `onUserEdit([rowId])` runs. No commit if the value is unchanged.
- `utils/gridValidation.ts`: a `computed` map rowId → colId → message from `meta.validate`. A cell with a message gets the red border class. Backend save errors are kept as a separate map from rowId + field, styled like `.backend-validation-error`.
- Error sidebar unchanged. Clicking an entry scrolls the row into view (by id) and outlines the cell for 2 s.
- `GridApi.showErrors(errors)` sets the list; the status column re-renders by itself because it's reactive. The "skip rows being edited" workaround goes away.

## Acceptance

- Component tests: Escape restores the value; an Enter commit calls `normalizeRow` and `onUserEdit` once; clearing a required cell shows the error class without a save.
- Clicking a sidebar error for a row scrolled out of view brings it into view and outlines the right cell.

## VueUse (spec decision 8)

- Typing to start editing goes in the grid's single `onKeyStroke` handler (ticket 06): `e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey`. Don't use `onStartTyping` (document-only, drops `- . _` and space) or `isTypedCharValid` (same key-code filter).
- Outside-click commit: `onClickOutside(cellEl, commit, { ignore: [<USelectMenu content>] })`. Tab-away and teleported menu items still go through the editor's native `onBlur`. Don't use `useFocusWithin` for commit: the teleported menu counts as "outside".
- Scroll-to-error outline: `const outline = refAutoReset<{ rowId: string; colId: string } | null>(null, 2000)`; the cell class binds to it. Setting the same value again restarts the timer. Tests use fake timers.
- Validation stays a plain `computed`. No `useAsyncValidator`, and no `refDebounced` unless a measured rebuild cost justifies it.

## Done

Built with ticket 06 (they share the grid's single keydown handler). Under `frontend/apps/admin/src/`:
- `utils/gridValidation.ts`: `validateRows(rows, columns)` → `Map<rowId, { colId: message }>` (only invalid rows), from each `GridColumn.validate`. `indexSaveErrors(errors)` → the same shape from backend errors by `rowId` + `field`, first message per cell wins. `DataGrid` holds both as plain `computed`s.
- `composables/useDataGrid.ts`: `editCell(pos, value)` rebuilds the row as `{ ...normalizeRow({ ...row, [col]: value }), id }`, replaces it (other rows keep identity), then calls `onUserEdit([id])`. It returns false and changes nothing when the value is unchanged; blank equals blank (`null`/`undefined`/`''`).
- `components/DataGrid/GridCell.tsx`: the cell (moved out of `DataGrid.tsx`) with `TextEditor` (`UInput size="xs"`) and `ChoiceEditor` (`USelectMenu` with `defaultOpen`, the current value, and the typed character as its search term) inside a `data-grid-editor` wrapper. Text: Enter commits and moves down, Tab/Shift+Tab commit and move right/left, Escape cancels, blur commits. Choice: a pick commits, and a dismiss (Escape, outside click) cancels. Each cell reads active/selected/editing/invalid/save-error/outlined through its own primitive `computed`s. Invalid gets `ring-2 ring-inset ring-error`, `aria-invalid` and `title=<message>`. A save error also gets `bg-error/10` (the `.backend-validation-error` look).
- `components/DataGrid/ErrorSidebar.tsx`: the `GridEditor` sidebar markup, same entries (`Row N: field` + message). A failed request (`saveResult` network entry) shows as a non-clickable `role="alert"` "Network / Save failed" entry. Clicking an error sets `scrollTop = visibleIndex * ROW_HEIGHT`, makes the cell active, scrolls horizontally so the cell sits left of the 320px sidebar, focuses the grid, and sets `refAutoReset(…, 2000)` for a 3px red outline.
- `DataGrid.tsx`: `startEdit` (only for columns with an editor) and `endEdit`. `endEdit` is idempotent: it acts only while the given cell is still the editing cell, so blur-after-Enter or pick-then-close is a no-op.

Deviations:
- The draft stays inside the editor component (spec risk "the editing draft stays local until commit"). Shared state holds `editing: { pos, seed }`, where `seed` is the typed character. So keystrokes in an editor re-render nothing else.
- No `onClickOutside`. A press on any grid cell focuses the grid root natively, which blurs the input and commits. The choice menu's own dismiss covers the teleported case. Both were checked in the browser below. The edit-end type carries `refocus`. A blur never refocuses the grid, because the person already moved focus (clicking a header filter while editing commits and leaves the filter focused). An outside click while the choice menu is open only closes the menu, which is Reka's behaviour and the same as the header filter menus. Focus then returns to the grid.
- Every row is validated on every `rows` change, with no per-row memo. Cost at 2,000 rows is unmeasured and left to ticket 11.
- `GridApi.showErrors` is ticket 10. `saveErrors` is already derived from `errorList`, so it only has to set the list.

Evidence (2026-11-25):
- `DataGrid.test.ts` (real `UTable` + Nuxt UI, happy-dom): Escape keeps `Wages` and calls no `onUserEdit`. Enter calls `normalizeRow({ id:'r1', topic:'  Forced labor ', risk:'Low' })`, shows `Forced labor`, calls `onUserEdit` once with `['r1']`, moves to r2 and shows "1 change". Clearing a required cell gives `aria-invalid`, `title="Required"`, `ring-error`, and `onSave` is not called. Typing `P` replaces the value. A choice pick lists High/Medium/Low and commits Medium. A backend error gets `bg-error/10`, and its entry click outlines the cell, which is gone after `advanceTimersByTime(2000)` (fake timers). A rejected save shows `NetworkSave failed`. `useDataGrid.test.ts` adds normalize/identity/no-op cases, and `gridValidation.test.ts` has 4 cases.
- Browser `/next` (omp headless Chromium, real CDP input via `tab.dblclick`/`tab.press`/`page.keyboard`): double-click Issue (row 2), then Meta+A, type `Edited issue`, ArrowLeft/ArrowUp inside the input (the active cell stays `issue@1`), Enter. The cell reads `Edited issue`, the active cell is `issue@2`, the chip shows "1 change", and focus is on the grid root. Double-click Risk Level opens the menu with `High*`, `Medium`, `Low` (current value checked). Escape closes it, keeps the cell, and focus returns to the root. Arrow+Enter in the menu picked `Medium`. Typing `x` on Evidence Expectation opened the editor with `x`. Escape restored `Evidence within 30 days`. Typing `q` then Tab committed `q` and moved to Best Practice. Clearing Issue showed `aria-invalid` + `title=Required` with no save. Clicking another cell while editing committed `blur-commit A`. Clicking the Issue filter while editing committed `blur-commit B` and left the filter focused.
- Sidebar (browser): Add Row, Save (8 backend errors for the blank row), sort Category Code ascending (blank last, row 11 of 11), viewport 1000×360, `scrollTop` 0. Before: the target cell top was 513, below the grid bottom of 360. Clicking `Row 1: evidenceExpectation` gave `scrollTop` 189 (the max), `scrollLeft` 1080, cell rect 430–680 × 324–360 inside the grid (0–1000 × 85–360), right edge at the sidebar's left edge, and an `elementFromPoint` hit on the cell. Its outline was `rgb(231,0,11)`, it became the active cell, and the root had focus. A second run on `Row 1: closureTiming`: outlined at 0 ms and 1,500 ms, gone at 2,300 ms. Screenshot taken during the run.
- Re-renders: see ticket 06.
- `pnpm --filter @sc/admin typecheck` and `pnpm lint` are clean. 8 test files, 114 tests pass (DataGrid, useDataGrid, useGridSelection, gridValidation, gridRange, gridClipboard, ComplianceGridEditor, useGridEditor). The happy-dom `AbortError` printed at teardown also happens when HEAD's `DataGrid` is only mounted, so it predates this change.
