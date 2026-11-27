# 08 Delete/Backspace clears the range

Status: resolved
Blocked by: 06
Parity: P15

## Change

- `clearCells(rows, cellsIn(range), columns)` (pure): returns new rows with `null` in every cell whose column has an editor. Status, checkbox and other read-only columns are never written.
- The keydown handler calls `preventDefault()` for Delete/Backspace whenever the grid root (not an input) has focus, applies the rows through `normalizeRow`, then calls `onUserEdit(touchedIds)` once.
- Validation and dirty state update on their own (derived). The Tabulator-era stale-cell and `row.validate()` workarounds are not needed.

## Acceptance

- Unit test: a range spanning Status + checkbox + email + firstName over 2 rows clears only email and firstName.
- Real-browser check on the invite page: the same range + real Backspace → cells empty, status "Not ready", errors listed, URL unchanged, no console errors.

## VueUse (spec decision 8)

- Delete/Backspace is a `case` in ticket 06's `onKeyStroke` handler, with the same input bail-out, not a second listener.
- Undo (`useManualRefHistory`) is possible but not parity. Leave it out.

## Pure module (done)

`utils/gridClear.ts` (tests: `gridClear.test.ts`, including the Status + checkbox + email + firstName over 2 rows case). Not wired yet.

```ts
clearCells(rows: ReadonlyArray<Row>, cells: ReadonlyArray<ReadonlyArray<CellPos>>, columns: ReadonlyArray<GridColumn>): { rows: ReadonlyArray<Row>; touchedIds: Array<string> }
```

- Writes `null` only where the column has an editor. A cell whose column has `editor: null` or isn't in `columns` (e.g. `__select` if it stays a TanStack-only column) is never written.
- Blank cells (`null`, `undefined`, `''`) are skipped, so `touchedIds` (row order) lists only rows that lost a value. Untouched rows keep identity; when nothing is cleared the input `rows` array comes back, so the caller can skip the assignment and the `onUserEdit` call when `touchedIds` is empty.

## Done

Built 2026-11-25. Under `frontend/apps/admin/src/`:
- `composables/useDataGrid.ts`: `clearCells(cells, columns)` runs the pure `clearCells`. If nothing was touched it returns without assigning `rows` or calling `onUserEdit`, matching `clearRangeCells`, where only non-blank cells with an editor count. Otherwise it runs each touched row (and only those) through `normalizeRow`, assigns `rows` once, and calls `onUserEdit(touchedIds)` once. Tabulator called it once per cleared cell through `cellEdited`.
- `DataGrid.tsx`: the `Delete`/`Backspace` case calls `preventDefault()` whenever the root (not a control) has the key, with or without an active cell, and then `grid.clearCells(selection.cells(), columns)`. The `if (!pos) return` guard moved into the Enter and typing cases so that it doesn't block the swallow. Validation and dirty state update on their own.

Deviations: none. `__select` is not in `order.colIds`, so a range never holds it. The pure function also ignores it if passed.

Evidence (2026-11-25):
- `DataGrid.test.ts`: columns Status (read-only) + Topic + Risk, row r1 ticked. A press beside r1's checkbox (whole row, Status included) then Shift+ArrowDown, then Backspace: `defaultPrevented`. Topic and Risk are empty on r1 and r2 and Topic is `aria-invalid`. Status still says "Ready", r1 stays ticked, r3 is untouched, and `onUserEdit` was called once with `['r1','r2']`. A second Delete over the now-blank range doesn't call it again. `useDataGrid.test.ts`: a block over `__select` + read-only `status` + `first` clears only non-blank `first`. `normalizeRow` gets the cleared row (its derived field is recomputed). The untouched row keeps identity, `onUserEdit(['a'])` is called once, and a repeat keeps the same `rows` array.
- Browser `/next` after reload, all real CDP input: click r1 Topic, Shift+click r2 Risk Level, Backspace. Topic and Risk Level are empty on rows 1–2 and `aria-invalid`, with red rings in a screenshot. Rows 1–2's other columns and row 3 are unchanged. The chip says "2 changes". `location.href` and `history.length` are unchanged, with no console errors. The invite-page check (Status "Not ready", errors listed) needs ticket 10.
