# 07 Paste from Excel and the empty state

Status: ready-for-agent
Blocked by: 06
Parity: P13, P14

## Change

- `paste` on the grid root (ignored when the target is an input): text → `pasteParser?.(text, positional) ?? positional()`, where `positional` is today's `parseClipboardPaste` over columns with `meta.paste`. The result goes through `addRows` (fresh ids, `normalizeRow`, marked added), then `onUserEdit(newIds)`.
- `parseClipboardPaste` moves to `utils/` and drops the Tabulator `clipboard` flag in favour of `meta.paste`. Its existing tests are ported.
- Insert mode only (append), as today. Pasting over a range is not part of parity.
- Empty-state overlay: clicking it focuses the grid root, so a real Cmd/Ctrl+V works on an empty grid. The overlay text stays.

## Acceptance

- Invite page on `/next`-style wiring: a header row with aliases maps by name, an unmapped table is held for the mapping panel, and a positional paste works with Auto-match off. Same outcomes as the existing `BulkInviteUsers` tests.
- Real-browser check: empty grid → click overlay → real Cmd+V (clipboard written through CDP) → rows appear. Report which of these steps was real and which was scripted.

## VueUse (spec decision 8)

- Paste: `useEventListener(gridEl, 'paste', e => …e.clipboardData.getData('text/plain'))`, bailing out when the target is an input. Not `useClipboard`.
- Overlay click: `useFocus(gridEl).focused.value = true` (calls `el.focus()`). The root keeps `tabindex=0` and `role="grid"`; on `UTable` they land on the scroll container through `$attrs`.

## Pure module (done)

`parsePositionalPaste` in `utils/gridClipboard.ts` (tests: `gridClipboard.test.ts`). Not wired yet; `parseClipboardPaste` in `useGridEditor.ts` stays for the Tabulator engine.

```ts
parsePositionalPaste(text: string, columns: ReadonlyArray<GridColumn>): Array<Record<string, string>>
```

- Same behaviour as `parseClipboardPaste`, keyed on `column.paste` instead of Tabulator's `clipboard` flag. Its tests are ported by behaviour, except `visible: false`: hidden fields never become a `GridColumn`, so there is nothing to filter.
- Missing trailing cells are absent keys (as before). Quoted cells and `\r` are still not handled (known gap, spec Scope).

## Done

Built 2026-11-25. Under `frontend/apps/admin/src/`:
- `composables/useDataGrid.ts`: `addRows(rows): Array<string>` gives each row a fresh `crypto.randomUUID()` (an `id` in the input is replaced, as in Tabulator's `GridApi.addRows`), runs it through `normalizeRow`, appends to `rows`, and returns the new ids. It does not call `onUserEdit`: the paste path reports, an agent write (ticket 10's `GridApi.addRows`) won't. A private `normalized(row)` (normalizeRow, id kept) is shared by `addRows`, `editCell` and `clearCells`.
- `components/DataGrid/DataGrid.tsx`: `useEventListener(gridEl, 'paste')` with the same `fromControl` bail-out as copy and keys. It calls `preventDefault()`, reads `clipboardData.getData('text/plain')`, then `pasteParser?.(text, positional) ?? positional()` with `positional = () => parsePositionalPaste(text, columns)`, then `grid.addRows(…)`, then `onUserEdit(newIds)`. A parser that returns `[]` (held paste) adds nothing and reports `[]`, like Tabulator's `clipboardPasted` on an empty parse.
- Insert position: bottom. Measured in Tabulator 6.7.1 source: `clipboardPasteAction: 'insert'` → `table.addData(data)` with the default `addRowPos: "bottom"`. Add Row stays at the top, as before.
- `components/DataGrid/EmptyState.tsx`: the Tabulator overlay (same markup and text), shown when `rowCount === 0` and not saving. A click sets `useFocus(gridEl).focused.value = true`. It's its own component so `isSaving` doesn't re-render `DataGrid`. `role="presentation"`: keyboard users reach the grid with Tab, since the root stays `tabindex=0`.

Deviations: none from parity. One measured edge: right after Clear → Clear All, `UModal` gives focus back to the Clear button when its close animation ends. An overlay click in the first ~200 ms loses focus to it (0 ms and 100 ms: focus ends on Clear; 250 ms and 500 ms: focus stays on the grid). Tabulator's overlay has no focus behaviour at all, so this is not a regression. Not fixed.

Invite-page acceptance (header/alias mapping, held unmapped table, positional with Auto-match off) needs the invite page on `DataGrid`, which is ticket 10. Here the `pasteParser` contract is covered by a component test. The invite-page paste check moves to ticket 10.

Evidence (2026-11-25):
- `DataGrid.test.ts` (paste): positional paste appends 2 rows below r1–r3 with 2 new distinct ids, `normalizeRow` trims, an extra trailing cell is dropped, `onUserEdit` is called once with the new ids, the chip shows "2 changes", and the event is `defaultPrevented`. `pasteParser` gets `(text, positional)`. Returning `[]` adds nothing and reports `[]`. Its mapped rows are inserted. A paste in a header filter is ignored. Empty grid: overlay click → `document.activeElement` is the grid root → paste → 2 rows and the overlay is gone. `useDataGrid.test.ts`: `addRows` replaces a given id, normalizes, appends, counts as 2 dirty, and doesn't call `onUserEdit`.
- The component test caught a real bug: `props.onUserEdit?.(grid.addRows(…))` skips the `addRows` call when no `onUserEdit` is passed (optional-call short-circuit). Fixed by computing the ids first.
- Browser `/next`, omp headless Chromium, 2026-11-25. Real CDP input: the clicks on Clear and Clear All (overlay shows, "0 rows"), the overlay click (root focused), and Meta+V sent with `page.keyboard` plus the `paste` editing command (that's how Chrome on macOS maps Cmd+V). Scripted: clipboard written with `navigator.clipboard.writeText('Fire safety\tHigh\nNoise exposure\tLow')` after `Browser.grantPermissions`. Result: "2 rows", overlay gone, rows `[Fire safety, High]` and `[Noise exposure, Low]`, URL unchanged, no console errors.
