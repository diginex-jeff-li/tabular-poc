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
