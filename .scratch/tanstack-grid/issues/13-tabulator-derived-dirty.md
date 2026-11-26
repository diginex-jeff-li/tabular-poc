# 13 Tabulator: derive dirty state from the data

Status: ready-for-agent
Spec: `../spec.md` "Phase 2", invariant + P25
Blocks: 14, 15, 16, 17 (Tabulator side)

## Why

Tabulator's dirty count comes from `useDirtyTracking` (event-driven `markDirty`). Writes that don't fire `cellEdited` are invisible to it. Probe (2026-11-26): with `history: true`, ⌘Z restored the value but the chip still said "1 change". With `selectableRangeFill: true`, a fill showed "0 changes", so Save would drop it.

## Change

- Compute the Tabulator engine's dirty state the way `DataGrid` does: `diffRows(snapshot, currentRows, normalizeRow)` from `utils/gridDiff.ts`. The snapshot is the data at load and the rows sent by the last successful save. Recompute on Tabulator's `dataChanged` event, which fires for every data change, or on a cheaper equivalent you measure.
- `buildSavePayload` comes from the same diff. Delete `useDirtyTracking` and its `markDirty`/`markDeleted` calls once nothing uses them, together with its tests, per Migrate Callers Then Delete.
- Keep every existing behaviour (P6, P7, VAL-GRID-023 clear-all deletes, Saved badge, beforeunload).

## Acceptance

- Existing `useGridEditor`/`GridEditor` tests pass. Tests that pin `markDirty` internals are rewritten to assert the dirty count and save payload.
- Real browser, `/tabulator`: edit then revert by hand gives "0 changes". Delete a row gives "1 change". Save sends the right payload.

## Done (Tabulator)

Built 2026-11-26. Under `frontend/apps/admin/src/`:
- `composables/useGridEditor.ts`: `rows` (a `shallowRef` of Tabulator's live row objects, re-read after every write path), `snapshot` (copies of the rows at load, then the copies sent by the last successful save), `diff = diffRows(snapshot, rows, normalizeRow)`, `dirtyCount` = added + modified + deleted, `rowCount = rows.length`. Save sends `buildSavePayload(diff)`. A row loaded without an id gets a fresh one, as in `useDataGrid`.
- `useDirtyTracking.ts` and its test are deleted (no callers left), and `AGENTS.md` no longer lists it. Every `markDirty`/`markDeleted` call is gone; Clear relies on the diff listing saved rows as deletes (VAL-GRID-023 kept).
- Not `dataChanged`. Measured: with a `dataChanged` listener Tabulator builds `getData()` once per added row, so a 2,000-row paste took 7.7 s (append) / 7.6 s (overwrite). Without it, 0.1 s / 0.12 s. Rows are instead re-read by each write path (`commit`, undo/redo, agent writes) and on `dataProcessed` (load, `replaceData`).
- Cost at 2,010 rows (dev server, Enter keydown → next frame, `/tabulator`): an edit commit takes 16–37 ms, against 4–17 ms at 10 rows. That covers the commit's copy of the rows, two diffs and Tabulator's own render.

Behaviour change vs the event map, same as TanStack's ticket 04: an edit reverted by hand is no longer a change.

Evidence:
- `useGridEditor.test.ts` (60 tests, rewritten mock). The mock is now a small in-memory Tabulator over the `data` option, so tests assert the dirty count, save payload and row data instead of `markDirty` calls. Cases: edit reverted by hand is 0 changes; save payload `{upserts: [added, r1], deletes: ['r2']}`; an edit made while the save is in flight stays dirty; Clear counts saved rows as deletes and drops unsaved ones. `GridEditor.test.ts` is unchanged apart from the new Columns menu stub and one new test. `inviteDraft`, `inviteAgentTools` and `gridDiff` tests pass unmodified (6 files, 129 tests).
- Real browser (omp headless Chromium, CDP; real mouse double-click and keys): `/tabulator`, Issue row 1 edited → "1 change", typed back → no chip. Ticked row 2, Delete → "9 rows 1 change". Save → CDP logpoint in `mockBulkSave` logged `{"upserts":[],"deletes":["01a94ccc-…"]}`, badge "Saved 1".
