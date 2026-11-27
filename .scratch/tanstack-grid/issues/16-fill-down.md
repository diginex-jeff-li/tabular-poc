# 16 Fill down

Status: resolved
Blocked by: 13 (Tabulator side)
Spec: `../spec.md` "Phase 2", decision 5, P23, P25

## Change

- **TanStack:** a fill handle drawn on the range's bottom-right cell. Dragging it extends a preview over the rows below or above (auto-scroll near the edge, as in ticket 11's drag). On release, a pure `fillRange(rows, order, source, target, columns)` copies the source values, repeating the pattern, into the editable columns only. It is one person write: `normalizeRow`, `onUserEdit` once, one undo entry. The handle must work with virtualization: target rows are found from data, never from the DOM.
- **Tabulator:** `selectableRangeFill: true`. Check that it skips read-only columns and reaches the derived dirty count, `onUserEdit` and undo.

## Acceptance

- Unit tests: a 1×1 copy over 3 rows; a 2-row pattern repeated over 5 rows; read-only columns untouched.
- Real browser, all four routes: drag the handle down 3 rows and the values copy. The change count goes up, and ⌘Z restores the old values.

## Done (TanStack)

Built 2026-11-26. Under `frontend/apps/admin/src/`:
- `utils/gridFill.ts` `fillRange(rows, order, source, toRowId, columns)` → `RowChange`. Target rows are the visible rows between the source and `toRowId`, below or above. Row `k` rows from the source's top gets source row `k mod height`, so the pattern runs on unbroken in both directions. Only the source's editable columns are written; values are copied as stored (no series). Released inside the source → nothing.
- `composables/useGridSelection.ts`: `fill: { source, toRowId } | null` beside `editing` (a fill only starts while nothing is edited; `startEdit` ends a fill). `startFill()` takes the current range; `dragTo(pos)` moves the fill's target row while a fill runs, the range focus otherwise; `endFill()` returns the fill and grows the range over the filled rows. `isCorner` and `isFillTarget` feed per-cell computeds.
- `GridCell.tsx`: the handle is an 8px square on the range's bottom-right visible cell (hidden while editing); filled-to-be cells show a dashed outline and the range tint. `DataGrid.tsx`: the press on the handle starts the existing drag loop, so edge auto-scroll and `cellAt` (row from data and `scrollTop`, never the DOM) work for fills as for range drags; the window `pointerup` calls `endFill` and `grid.commit(fillRange(…))`: one undo step, `normalizeRow`, `onUserEdit` once.

Parity notes for the lead:
- Down and up only; a sideways drag keeps the source's columns.
- After a fill the range covers source + filled rows (Excel). Escape does not cancel a fill drag in progress.

Evidence:
- `gridFill.test.ts` (5): 1×1 over 3 rows; 2-row pattern over 5 rows with Status in the source untouched; upward fill keeps the pattern; sorted/filtered order; release inside the source returns the same array.
- `DataGrid.test.ts`: Topic+Risk of r1 selected, handle dragged to r3 → preview dashed, both columns copied to r2–r3, range grows, `onUserEdit(['r2','r3'])` once, "2 changes", ⌘Z restores. Hidden-column test: a fill with Topic hidden writes Risk only.
- Browser, real CDP mouse. `/`: Topic+Risk Level rows 1–2 selected (screenshot shows the handle and a 3-row dashed preview); Risk Level row 1 handle dragged 3 rows → `High, High, High, High` (was `High, Medium, …`), "1 change" (only row 2 differed), ⌘Z → `Medium` back. `/invite-users`: Last Name row 1 dragged 3 rows → `Lee` ×4, "4 changes"; ⌘Z → `Lee, Kim, Lee, Fox`. With 2,000 rows: handle held 40px below the grid for 1 s → `scrollTop` 2,232, release fills 75 rows (⌘C → 76 × `Last1`), ⌘Z restores `Last2…Last76`. Release → next frame 111–131 ms on the invite page (same page-side costs as ticket 14's timing note).

## Done (Tabulator)

Built 2026-11-26 in `composables/useGridEditor.ts`. `selectableRangeFill: true` (Tabulator's own handle and dashed preview). Its 6.7.1 `FillHandle` repeats the source rows the same way `fillRange` does (row `k` gets source row `k mod height`, both directions). It writes only cells `edit.allowEdit` allows, so Status and `__select` are never written. After release the range covers source and filled rows.
- Closing the gaps: `rangeEdited` → one `personWrite` that runs `normalizeRow` on each modified row, validates them, records one undo step and calls `onUserEdit` once. Before ticket 13 the fill showed "0 changes".
- **Down and up only.** Tabulator grows the fill along whichever axis the pointer strayed further, with no option for this. `fillRowsOnly` wraps the internal `fillHandle.handleCellMouseMove` (via `tab.modules.selectRange`, not public API) and pins the pointer column to the source's right edge.

Parity notes:
- Tabulator's handle has no edge auto-scroll. `FillHandle.js` contains no scroll code [read in source, not measured]. TanStack auto-scrolls near the edge, so on Tabulator a fill past the visible rows needs a wheel scroll while dragging [not tested].
- Tabulator compares old and new with `!==`, so filling `null` over `''` counts as a write. The shared `writeCells` treats blanks as equal. The dirty count is unaffected: `diffRows` decides that, and the history step is skipped if nothing differs.
- The fill does not use the shared `fillRange`. Same rule, different code.

Evidence:
- `useGridEditor.test.ts`: `rangeEdited` over two rows → both normalized, `onUserEdit(['r2','r3'])` once, "2 changes", one ⌘Z restores both and clears the count.
- Browser, real CDP mouse. `/tabulator`: Risk Level row 2 (`Medium`) handle dragged down to row 5 with the pointer drifting into Issue → Risk Level `High, Medium, Medium, Medium, Medium`, Issue untouched, "3 changes"; ⌘Z → `High, Medium, High, High, High`, no chip. Topic row 3 handle dragged sideways to Issue → nothing written. Risk Level row 5 set to Low, handle dragged up to row 3 → `Low` ×3, "3 changes"; ⌘Z restores. `/tabulator/invite-users`: Status cell pressed (row range incl. Status and `__select`), handle dragged to row 2 → Email/First/Last/Role copied, Status recomputed (`Not ready`, duplicate email), "2 changes"; ⌘Z → both rows back.
