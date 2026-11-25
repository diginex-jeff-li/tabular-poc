# 11 Virtualization for large pastes

Status: ready-for-agent
Blocked by: 10
Parity: P20

## Change

- Turn on `UTable` `virtualize` (or `useVirtualizer` if 01 chose headless) with the measured row height.
- **The virtualizer is not reachable on `UTable`.** `UTable` exposes only `$el`, `tableRef` and `tableApi` (checked in `@nuxt/ui` 4.13.1 `Table.vue` `defineExpose`). Scrolling a row into view therefore goes through the scroll container: `const { y } = useScroll(gridEl, { observe: { mutation: true } })`, then `y.value = visibleIndexOf(rowId) * rowHeight - (viewportHeight - rowHeight) / 2`. Capturing the instance through the `virtualize` option's `onChange` is an alternative, but **unverified** for the first scroll, so don't rely on it. If ticket 01 chose headless, use our own `virtualizer.scrollToIndex` directly.
- This applies to `scrollToError`, to keyboard moves past the viewport, and to drag auto-scroll at the edges (`useRafFn` + `useScroll`, ticket 06).
- An editor whose row is virtualized out commits first: `onElementRemoval(cellEl, commit)`.
- Range, copy, clear and export already work from data (tickets 06–09). This ticket verifies that with rows outside the DOM.
- Not used: `useVirtualList` (a second virtualizer) and `useElementSize` (`UTable` already measures rows).

## Acceptance

- 2,000 pasted invite rows: scrolling stays smooth (no long tasks over 50 ms in a performance trace while scrolling).
- Shift+End then Cmd+C copies all 2,000 rows.
- Clicking an error for row 1,900 scrolls to it and outlines the cell.
- Starting an edit, then scrolling the row out of view, commits the value.

## Done

Built 2026-11-25. Under `frontend/apps/admin/src/`:
- `DataGrid.tsx`: `UTable virtualize={VIRTUALIZE}`, hoisted `{ estimateSize: ROW_HEIGHT, overscan: 4 }`. The real row height equals the estimate: at `scrollTop = 1234 × 36` every rendered `tr` is 36px and row 1,235 sits 0px under the sticky header. `reveal` and `showError` already scroll by `visibleIndex × ROW_HEIGHT` on the scroll container, so scroll-to-error and keyboard moves needed no change.
- Keys: Ctrl/Cmd+Home and Ctrl/Cmd+End go to the grid's first and last cell, as in Excel. With Shift they extend the range. **Ctrl/Cmd+Shift+End is the range-to-last-row key.** Shift+End alone still extends to the row's last column, and Ctrl/Cmd+Shift+ArrowDown still extends down the column. `gridRange.ts` gains `first`/`last` directions.
- Drag auto-scroll: a press on a cell resumes a `useRafFn` loop. While the button is held and the pointer is past the body's top, bottom, left (pinned columns excluded) or right edge, it scrolls by the overshoot (at most one row per frame) and moves the range focus to the cell under the pointer. The row comes from data (`(y + scrollTop) / ROW_HEIGHT`, the row may not be rendered yet), the column from the `th` geometry. Nothing scrolls while the pointer is inside the body, so a click on the edge row doesn't move. Release pauses the loop. It writes `scrollTop`/`scrollLeft` directly, like `reveal`, instead of `useScroll`, so the grid keeps one way to scroll.
- Editor scrolled out: `TextEditor` commits its draft in `onBeforeUnmount`, and `ChoiceEditor` cancels there (only a pick commits). Both hand focus back to the grid. `endEdit` is idempotent, so an edit that already ended is a no-op. Chrome happens to fire `blur` when a focused input is removed, but happy-dom doesn't (nor does Firefox), and focus then fell to `<body>`. Not `onElementRemoval`: the unmount hook needs no MutationObserver.
- Tests: `components/DataGrid/testLayout.ts` `useGridLayout()` stubs `offsetHeight` (36), `clientHeight` (720) and a silent `ResizeObserver` per test, because happy-dom has no layout and the virtualizer rendered 0 rows. Both `DataGrid.test.ts` and `pages/BulkInviteUsers.test.ts` call it. `mountGrid` is async (rows render one tick after mount).

Deviations: overscan 4 instead of `UTable`'s default 12 (measured below). Edge auto-scroll had not been built in ticket 06; it is built here.

### Measurements

Probe: omp headless Chromium, 1365×768, `/invite-users` (before: `/next/invite-users` on the same `DataGrid`). 2,000 rows pasted with a real Cmd+V (header row + 2,000 lines, rows 10 and 1,900 with an invalid email). Long tasks are `RunTask` events over 50ms on `CrRendererMain` in a Chrome trace (`page.tracing`, `devtools.timeline`); a `longtask` PerformanceObserver agreed in every run. Paste and commit time: from the `paste`/Enter `keydown` (capture listener) to the next frame (`rAF` + `setTimeout`). Scroll runs use real CDP wheel input: fling (40 × 1,200px every 40ms), wheel (150 × 100px every 16ms), jump (10 × 6,000px every 100ms). Traces: `/tmp/t11-*.json`.

| Metric | Before (no virtualize) | After | Runs |
|---|---|---|---|
| Rows in the DOM | 2,000 `tr`, 12,000 cells | 21 `tr`, 120 cells | |
| Paste 2,000 rows → paint, dev | 2,954ms (one 2,618ms task) | 98–123ms | 1 / 3 |
| Paste → paint, prod build | 1,968–2,216ms | 78–83ms | 2 / 3 |
| One cell edit, Enter → paint, dev | 3,683ms | 31–40ms | 1 / 3 |
| Enter → paint, prod build | 3,619–3,817ms | 36–43ms | 2 / 3 |
| Scroll tasks > 50ms, prod build (fling, wheel, jump, mixed) | 1 per run in wheel (62, 87ms) | 0 in 12 runs; max 41.8ms | 2 / 3 |
| Scroll tasks > 50ms, dev, overscan 12 (`UTable` default) | 0 (max 21ms) | 11–18 per fling, 50–71ms | 1 / 2 |
| Scroll tasks > 50ms, dev, overscan 4 (fling, wheel, jump, mixed) | | 0 in 4 of 7 runs; the others: three MajorGC tasks (60–64ms) and one 51ms frame | 7 |

What limits each number:
- Scroll (after): mounting the rows that enter the window. Vue's component timings put a row at ~1.7ms in dev, ~28% of it the `UCheckbox` subtree. A fling or jump replaces the whole window, so a frame mounts visible + 2 × overscan rows: 39 at overscan 12, 23 at overscan 4. That was the only change made for the bar. The remaining dev outliers are a V8 mark-compact GC task (43–49ms of marking, no app code in it) and one 51ms frame. The prod build has neither: the dev outliers are Vue dev-runtime overhead plus GC.
- Commit (after), one dev CPU profile at 100µs sampling: the Vue flush ~21ms (patching the edited row's visible cells ~15ms, TanStack row-model rebuild over 2,000 rows ~5ms), the invite page's `validateInvites` over 2,000 rows 8ms, GC 12ms. No single part dominates, and it is under 50ms, so nothing was optimized.
- Paste and commit (before): not profiled. Inferred: every pasted row's cells mount, and every `showErrors` re-renders all 2,000 Status cells. Virtualization removes both, so they weren't pursued.

### Acceptance (dev server, real CDP input, 2,000 pasted rows)

- Scrolling: prod build 0 long tasks over 50ms in 12 scroll runs (table above). Dev build: 0 in 4 of 7 overscan-4 runs; the outliers are listed above.
- Cmd+Home, then Cmd+Shift+End, then Cmd+C: the clipboard holds 2,000 lines, `user1@acme.com…` to `user2000@acme.com…`, 5 columns (Status isn't exported). After Cmd+Shift+End the grid is at `scrollTop` 71,506 (the bottom) and focus stays on the root. 25 × ArrowDown keeps the active cell inside the viewport (`scrollTop` 442), and Cmd+ArrowDown shows row 2,000.
- Sidebar "Row 1900: email" (real click): `scrollTop` 68,364 = 1,899 × 36. The email cell `user1900@@acme.com` has a 3px `rgb(231,0,11)` outline, is fully visible, wins an `elementFromPoint` hit test, and the grid root has focus. The outline is gone 2.1 s later.
- Double-click Last Name on row 1, type `-scrolled`, then 6 real wheel steps of 400px: the row is out of the DOM, no editor remains, and focus is on the grid root. ArrowDown still reaches the grid. Scrolling back shows `Last1-scrolled`.
- Drag (real mouse): press on row 1 First Name, move 40px below the grid, hold 1 s. The grid scrolls 2,196px, Cmd+C after release copies 75 lines (`First1…` to `First75`), and the scroll stops on release.
- Tests: `DataGrid.test.ts` +2. An edit whose row scrolls out commits once, keeps focus on the root, and shows the value after scrolling back; this test failed before the `onBeforeUnmount` hooks. Ctrl+Shift+End over 60 rows (20 rendered) selects `r60`, and copy gives 60 lines. `gridRange.test.ts` +2 (`first`/`last`, extend to the last cell). Full admin suite: 24 files, 289 tests pass. `pnpm --filter @sc/admin typecheck` and `pnpm lint` are clean, and `vp fmt --check` is clean on the touched files.
