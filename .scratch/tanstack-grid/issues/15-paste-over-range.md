# 15 Paste over a range

Status: ready-for-agent
Blocked by: 13 (Tabulator side)
Spec: `../spec.md` "Phase 2", decisions 3–4, P22, P25

## Change

- **TanStack:** a pure `overwritePaste(rows, order, active, text, columns)`. It returns new rows plus the touched and added ids. Values are written from the active cell rightward over visible editable columns and downward over visible rows; read-only columns are skipped; extra lines become new rows at the bottom (fresh ids); extra columns are dropped; `normalizeRow` runs on every touched row. The paste handler picks overwrite when the grid has an active cell and append otherwise. The invite `pasteParser` stays on the append path only.
- **Tabulator:** use `clipboardPasteAction: 'range'` when a range is active and `'insert'` otherwise, or Tabulator's equivalent. Check that it skips read-only columns, applies the overflow rule, and reaches the derived dirty count and `onUserEdit`. List any behaviour Tabulator cannot match.

## Acceptance

- Unit tests: a 2×2 block over a range starting at Status skips Status; a 3-line paste on the last row adds 2 rows; an empty grid appends.
- Real browser, real ⌘V, all four routes: select a cell in row 2, paste a 2×2 block, and the cells change in place. The change count goes up and the Save payload contains the rows.

## Done (TanStack)

Built 2026-11-26. Under `frontend/apps/admin/src/`:
- `utils/gridPaste.ts` `overwritePaste(rows, order, origin, text, columns)` → `RowChange`. It writes from `origin` rightward over the visible editable columns (`editor !== null`) and downward over the visible rows, in screen order (sort, filter, column order and hiding all respected). Read-only and hidden columns are skipped, not consumed. Cells past the last editable column are dropped. Lines past the last visible row become new rows appended to `rows` (fresh ids), except lines whose cells are all blank. A cell that keeps its value doesn't touch its row; nothing changed → same array, no undo step. One trailing line break and `\r` before each break are dropped; a blank middle line writes blank cells. `columns` is typed `ReadonlyArray<Pick<GridColumn,'id'|'editor'>>` so the Tabulator engine can call it (P2Tabulator asked to).
- `utils/gridWrite.ts` (new): `writeCells` (writes only changed values, `sameCell` blank = blank), `appendRows`, `editableIds`, `RowChange`. `gridClear.clearCells` and `editCell` now use `writeCells`.
- `DataGrid.tsx` paste handler: with a range, origin = the range's top-left visible cell, `grid.commit(overwritePaste(…))`. Without one, `grid.commit(appendRows(rows, pasteParser?.(…) ?? positional()))`. Escape on the grid now clears the range, so a person can get back to append.

Parity notes for the lead:
- Origin is the range's top-left (Excel and Tabulator's `bounds.start`), which is the active cell unless the range was drawn up or left.
- The block is always written at its own size: never tiled or clipped to a larger or smaller range. Tabulator's built-in `range` action does both (tiles, and with a multi-cell range clips; it never adds rows), so the Tabulator side needs the shared function or its own code to match.
- New key: Escape clears the selection.
- On the invite page, once a cell is active, a pasted table with a header line is written as data (no `pasteParser`), per decision 3.

Evidence:
- `gridPaste.test.ts` (5): 2×2 from Status skips Status; 3 lines on the last row adds 2 rows with fresh ids; extra cells dropped and sorted/reordered/hidden order followed (hidden `email` never written); unchanged values return the same array and a blank overflow line adds no row; a blank middle line writes ''. Empty grid appends: existing "focuses the grid from the empty-state overlay" test, unchanged.
- `DataGrid.test.ts`: Status cell of r2 selected, paste `Noise\tLow\nDust\tMedium\n` → r2/r3 overwritten, Status "Ready", `onUserEdit(['r2','r3'])` once, "2 changes", Save sends exactly r2 and r3 as upserts, ⌘Z restores. Last-row paste of 3 lines → 2 new rows; Escape, then paste appends. The existing append tests pass unchanged (they paste with no active cell).
- Browser (real CDP mouse and ⌘V with the `paste` command; clipboard written by `navigator.clipboard.writeText` after granting permission). `/`: click Issue row 2, paste `Pasted issue A\t60\r\nPasted issue B\t30\r\n` → rows 2–3 Issue and Closure Timing changed in place, row 4 untouched, "2 changes"; ⌘Z restored both. `/invite-users`: click Status of row 2, paste a 2×2 → Email and First Name of rows 2–3 changed, Status untouched, "3 changes"; Escape then paste → appended as row 4.

## Done (Tabulator)

Built 2026-11-26 in `composables/useGridEditor.ts`. Tabulator's clipboard now only copies (`clipboard: 'copy'`). Paste is the engine's own `paste` listener on the grid element, with the same control bail-out as the keys. **Not `clipboardPasteAction: 'range'`.** Its 6.7.1 source tiles the block over a multi-cell range, clips it to the range, never adds rows, and writes every visible column (Status and `__select` included), so it fails P22 on every count.
- With a range: origin = the active range's top-left cell. The engine calls the shared `overwritePaste(rows, order, origin, text, columns)` from `utils/gridPaste.ts`, unchanged, with `order` = Tabulator's active (filtered, sorted) rows and visible columns in screen order, and `columns` = `{ id, editor: 'text' | null }` from each visible column's `editor`/`editable`. Touched rows that exist are `row.update`d through `normalizeRow`. New rows are `addData`ed at the bottom. Touched rows are validated. It is one `personWrite`: one undo step, `onUserEdit(touchedIds)` once. Both engines run the same function, so origin, skipping, overflow, the blank-line and `\r` rules, and "no change, no step" are identical by construction.
- Without a range: `pasteParser` (or positional over the visible columns in screen order), `normalizeRow`, fresh ids, `addData` at the bottom, validate, `onUserEdit(newIds)` once. The id fix-up through `replaceData` after Tabulator's insert is gone.
- `selectableRangeInitializeDefault: false`, so nothing is selected at load and a first paste appends. Escape on the grid drops the range.

Parity notes:
- **Clicking a row checkbox selects that row as a range on Tabulator.** `__select` is Tabulator's range row header (pre-existing, ticket 12 P11). A paste right after ticking a row therefore overwrites that row from its first data column. On TanStack a tick does not move the active cell [inferred from DataGrid's design, not tested side by side].
- With nothing selected, arrow keys do nothing on Tabulator. TanStack selects the first cell (ticket 06). Before this change Tabulator started with a range on cell [0,0], so a paste after load would have overwritten row 1.
- Paste only fires with focus in the grid on both engines. After a toolbar click, ⌘V goes to the button.

Evidence:
- `useGridEditor.test.ts`: append path with positional parse, fresh ids, `normalizeRow`, one `onUserEdit`, validation, dirty 2; `pasteParser` returning `[]` adds nothing; a range starting at Status of row b → Email/First Name of b written, 2nd line appended as a new row with no `status` key, `pasteParser` not called, `onUserEdit(['b', newId])` once; a hidden column is skipped; Escape → append; a paste inside an input is left alone; after Delete removes the active cell's row the paste lands on the row now in its place.
- Browser (real CDP clicks and ⌘V with the `paste` command; clipboard set by `navigator.clipboard.writeText` after granting permission). `/tabulator`: click Topic row 2, paste `T1\tLow\nT2\tMedium\n` → rows 2–3 Topic/Risk Level changed in place, "2 changes"; ⌘Z → both back, no chip. Escape, then paste a 5-cell line → appended as row 11, "1 change"; ⌘Z → 10 rows. Topic hidden, click Compliance Category row 1, paste `C1\tI1` → Compliance Category "C1", Issue "I1", Topic untouched. `/tabulator/invite-users`: click Status of row 1, paste 3 lines of email/first name over 2 rows → rows 1–2 Email/First Name written, Status untouched, 3rd line appended ("3 rows 3 changes 2 errors"); ⌘Z → 2 rows, values back. Tick a row (scripted `checkbox.click()` so the range stays on Issue), Delete, focus the grid, paste → lands in the next row's Issue.
- 2,000-line paste at 10 rows: append 0.1 s, overwrite from row 1 0.12 s (2,000 rows, 1,990 added).
