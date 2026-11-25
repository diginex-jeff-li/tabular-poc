# 04 Row selection, add/delete/clear, dirty tracking, save loop

Status: ready-for-agent
Blocked by: 02
Parity: P5, P6, P7

## Change

- Checkbox column using `UCheckbox` with `enableRowSelection`. The header checkbox selects all filtered rows (matches Tabulator's `rowRange: 'active'`). `getRowId: row => row.id`. Clicking a data cell never changes row selection.
- `utils/gridDiff.ts`: `diffRows(snapshot, rows) → { added, modified, deleted }` by id. Modified means a field differs, compared after `normalizeRow`. `buildSavePayload` keeps today's shape. On a successful save, the snapshot is reset to the current rows.
- Add Row inserts `{ id: uuid }` at the top. Delete removes the selected rows and drops their entries from the error list. Clear (behind the confirm modal) removes all rows, so they show up as deleted in the diff (see VAL-GRID-023 in `useGridEditor.ts`). All three call `onUserEdit`.
- The save loop, "Saved N" badge (cleared when the next change appears), network-error entry and beforeunload guard are ported unchanged.

## Acceptance

- `gridDiff.test.ts`: add then delete before saving → nothing sent; edit then revert → not dirty (an improvement on the event-based map, worth noting in the PR); delete after save → in `deletes`.
- On `/next`: tick 2 rows → Delete → "2 changes"; Save → mock backend receives `{ upserts: [], deletes: [2 ids] }`.

## VueUse (spec decision 8)

- Baseline: `const { cloned: snapshot, sync } = useCloned(rows, { manual: true })`; call `sync()` after load and after a successful save. `diffRows(snapshot.value, rows.value)` stays pure. Don't use `isModified`: it watches the clone. The JSON clone treats a missing field and an `undefined` field as equal, which is fine for these rows.
- Clear confirm: `useConfirmDialog()`, with `UModal`'s `onUpdate:open` wired to `cancel()` so Escape or a backdrop click settles `reveal()`.
- beforeunload stays `useEventListener(window, 'beforeunload', …)`. VueUse 15 has no `useBeforeUnload`.
- The "Saved N" badge reset stays `watch(dirtyCount, …)`. `refAutoReset` would clear it on a timer, which is the wrong trigger.

## Done

Built (under `frontend/apps/admin/src/`):
- `utils/gridDiff.ts`: `diffRows(snapshot, rows, normalize?) → { added, modified, deleted }` by id. Fields are compared after `normalize` on both sides; a missing field equals `undefined`; objects are compared by JSON. `buildSavePayload(diff) → { upserts: [...added, ...modified], deletes }`, the same shape as today.
- `composables/useDataGrid.ts`: `rows` (shallowRef, replaced on every change), `rowSelection` (`Record<id, true>`), a baseline from `useCloned(rows, { manual: true })` with `sync()` after a successful save, `dirtyCount` derived from `diffRows`, `addRow` (`{ id: uuid }` at the top), `deleteSelected` (also drops those rows' error entries), `clearAll`, and `save` (ported loop: an empty payload sets `saved: 0` without calling the backend; backend errors go to `errorList` and keep the grid dirty; a throw records the `network` entry). The "Saved N" reset is `watch(dirtyCount)`, the guard is `useEventListener(window, 'beforeunload')`, and all three row actions call `onUserEdit`, as today.
- `components/DataGrid/DataGridToolbar.tsx` (own file): Add Row, Save (disabled when clean, `loading` while saving), Delete, Clear, `toolbarActions`, chips (rows, N change(s), errors, Saved badge). The Clear modal uses `useConfirmDialog`, and `UModal onUpdate:open(false)` calls `cancel()`. Toolbar-only state is read only here.
- `DataGrid.tsx`: a `__select` column (`UCheckbox` per row through `SelectCell`, which reads its own `computed`; the header checkbox uses `table.toggleAllRowsSelected`, which covers the filtered rows). Not pinned: `/` doesn't pin it either. Controlled `rowSelection` starts as `{}`.
- `components/gridEngineProps.ts`: the shared props contract (everything except `columns`). `GridEditor` and `DataGrid` both spread it; jscpd no longer reports the clone.

Deviations / notes:
- Edit then revert is no longer dirty. That is better than the event map.
- Kept from today: `save()` re-baselines to the rows as they are when the save resolves, so an edit made while a save is in flight is counted as saved. `useDirtyTracking.clearDirty` does the same.
- Bug in the existing code, not touched: `GridEditor`'s Clear modal passes its content as `UModal`'s default slot, which Nuxt UI v4 renders as the inline trigger, so the dialog itself is empty. `DataGridToolbar` uses `title`/`description`/`#footer`.
- The network error entry stays in `saveResult` only, as today (nothing renders it; ticket 05 owns the sidebar).

Evidence (2026-11-25):
- `gridDiff.test.ts` (9 tests): add then delete before save sends nothing; edit then revert is not dirty; delete after save goes to `deletes`; clear sends every saved id; comparison happens after normalize.
- `useDataGrid.test.ts` (11): delete ticked → 2 changes → payload `{ upserts: [], deletes: ['a','b'] }` → clean; error entries dropped on delete; backend errors keep it dirty; network entry; no backend call when clean; Saved badge cleared by the next change; clear; beforeunload only when dirty.
- `DataGrid.test.ts` (5): tick 2 rows plus a data-cell click → Delete → "2 changes" → Save → `{ upserts: [], deletes: ['r1','r3'] }`, chip gone; select-all under a filter ticks only the filtered row.
- Browser `/next`, with a temporary `console.log` in `mockBulkSave` that has since been removed: ticked rows 1 and 2, Delete → "8 rows 2 changes"; Save → console `{"upserts":[],"deletes":["6c7843c7-…","28ef9c17-…"]}` (the two deleted ids), badge "Saved 2", Save disabled. Add Row → a blank top row, "1 change", badge gone. Clear → modal "Clear all rows? This will remove all 9 rows…"; Escape and Cancel both close it with 9 rows kept; Clear All → "0 rows 8 changes" (the 8 saved rows are deletes; the unsaved added row counts nowhere).
- `vp test run` on DataGrid, useDataGrid, gridDiff, useGridEditor, ComplianceGridEditor, zodToColumnDefs and Application tests: 7 files, 93 tests pass. `pnpm --filter @sc/admin typecheck`, `pnpm lint` and `vp fmt --check` on touched files are clean.

Lead follow-up: the baseline is the `rows` array reference, not a `useCloned` copy. Rows are immutable, so a clone adds nothing. `save()` keeps the array it sent and makes that the baseline on success, so an edit made while the request is in flight stays dirty (regression test in `useDataGrid.test.ts`).
