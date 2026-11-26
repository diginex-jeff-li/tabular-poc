# 14 Undo / redo

Status: ready-for-agent
Blocked by: 13 (Tabulator side)
Spec: `../spec.md` "Phase 2", decisions 1–2, P21, P25

## Change

- **TanStack:** a history of `rows` arrays (rows are immutable, so an entry is an array reference), for example VueUse `useManualRefHistory`. Record one entry per person write: edit commit, paste, overwrite, range clear, fill, Add Row, Delete selected, Clear all. Undo and redo replace `rows`, then call `onUserEdit(idsThatChanged)`. An agent write through `GridApi` clears both stacks. Keys live in the grid's single `onKeyStroke` handler and are ignored when focus is inside a control.
- **Tabulator:** `history: true`, with ⌘/Ctrl+Z and the redo keys bound to `undo()`/`redo()`. Agent writes call `clearHistory()`. Make sure undo and redo reach `normalizeRow`, `onUserEdit` and the derived dirty count from ticket 13. Check which person writes Tabulator's history records (range clear, insert paste, add/delete row, clear all) and record what isn't covered. Bring every gap to parity or list it as a difference.
- Invite page: undoing a person change on an agent-proposed row clears its mark, which `draft.edited` already does when `onUserEdit` reports the row.

## Acceptance

- Unit tests (TanStack): undo and redo of an edit, a paste and a delete; an agent write empties both stacks; undoing back to the loaded data shows "0 changes".
- Real browser on all four routes, with a real ⌘Z: edit, undo, redo; then an agent `update_rows` followed by ⌘Z does nothing.

## Clarification (lead)

- Confirm (a person accepting an agent-proposed row) changes no row data, so it is not an undo step and ⌘Z does not un-confirm. The undo history holds rows only. Agent-proposed marks live in the invite draft and are not part of it.
- That is safe because of decision 1: every agent write empties both stacks. No undo or redo can bring back rows from before an agent change, so the draft's marks can't fall out of step with the rows. Undo and redo report the rows they changed through `onUserEdit`, and `draft.edited` clears any agent-proposed mark on those rows, as for any person edit.
- Both engines behave the same way here. This is not a parity gap.
- Extra acceptance on both engines: an agent `update_rows` resolves a needs-review row, so the row shows "Agent proposed"; ⌘Z then does nothing. Then: a person edits row A, confirms the agent-proposed row B, and presses ⌘Z. A's edit is undone, B stays "Ready", and Send behaves accordingly.

## Done (TanStack)

Built 2026-11-26. Under `frontend/apps/admin/src/`:
- `composables/useDataGrid.ts`: one person-write entry point, `commit({ rows, touchedIds }: RowChange)`. It runs `normalizeRow` on the touched rows still present, pushes the previous `rows` array onto the undo stack, empties redo, replaces `rows` (dropping ticks and save errors of rows that left), and calls `onUserEdit(touchedIds)` once. Edit commit, append paste, overwrite paste, range clear, fill, Add Row, Delete selected and Clear all all go through it. A change whose `rows` is the current array records no step (an unchanged edit, Delete with nothing ticked) but is still reported, as before. `undo()`/`redo()` move one array reference between the stacks and report `changedIds(before, after)` (new `gridDiff.ts` export: ids added, removed or whose row object changed). Agent writes (`api.addRows/updateRows/deleteRows`) go through `agentWrite`, which empties both stacks when rows change. A history step is one array of row pointers; no row is cloned. No cap.
- `DataGrid.tsx`: a second `onKeyStroke` on the document (not the grid root), so ⌘Z works after a toolbar click. ⌘/Ctrl+Z undoes, ⌘/Ctrl+Shift+Z and Ctrl+Y redo. Ignored when the target is inside `input, textarea, select, [contenteditable=true], [role=combobox], [data-grid-editor], [role=dialog]`.
- `DataGridState.addRows` is gone (the person path is `commit(appendRows(…))`, the agent path `api.addRows`).

Parity notes for the lead:
- Undo restores rows only: not row ticks, the range, save errors or the "Saved N" badge. Undoing Clear all brings the rows back but not the error list it cleared.
- Excel import goes through `GridApi.addRows`, so it counts as an agent write: not undoable, and it empties both stacks.
- Redo keys: Ctrl+Y only with Ctrl (⌘Y is Chrome's History shortcut on macOS).
- Answered P2Tabulator's questions with these rules (ids reported = rows that differ; no cap; document-level keys).

Evidence:
- `useDataGrid.test.ts` "undo and redo" (6): undo/redo of an edit back to 0 changes, a paste (rows removed, same rows back), Clear all then a delete one step at a time, no step for a write that changes nothing, an agent `updateRows` empties both stacks, a new write drops redo. Test changed: "appends added rows … without reporting them" became "commits appended rows … reports them once", because `DataGridState.addRows` was removed (its agent half stays covered by the `api.addRows` test).
- `DataGrid.test.ts`: ⌘Z / ⌘⇧Z (fired on the Add Row button) / Ctrl+Z / Ctrl+Y; ⌘Z in a header filter is not prevented and undoes nothing.
- `BulkInviteUsers.test.ts` (lead's extra case): person paste, agent `add_rows` + `update_rows` → "Agent proposed"; ⌘Z changes nothing; person edits Bo's first name, confirms Tom, ⌘Z → Bo restored, Tom stays "Ready", Send gives "(2 valid)".
- Browser, omp headless Chromium via CDP, real mouse and keys (`page.mouse`, `page.keyboard`), 2026-11-26. `/`: double-click Issue row 1, type " X", Enter → "1 change"; ⌘Z → original text, no chip; ⌘⇧Z → back; click Delete (focus on the button), Ctrl+Z → undone; Ctrl+Y → redone. `/invite-users`: real ⌘V paste of 2 rows; agent calls scripted through `window.scInvite` (add + update Tom → "Agent proposed"); real click + ⌘Z → nothing changed; real edit of Bo → "Bob", real Confirm click, ⌘Z → "Bo", Tom "Ready".
- Timing (dev server, keydown capture → next frame). `/` with 2,010 rows: Enter 68 (first), 38, 31, 45 ms; ⌘Z 39, 39, 25, 56 ms. `/invite-users` with 2,000 rows: Enter 85–105 ms, ⌘Z 66–141 ms. A CPU profile of one invite commit puts `useDataGrid.commit`'s own work under 1 ms. The rest is the page: `draft.edited` → `validateInvites` ~9 ms, `useInviteDraftStorage`'s localStorage write 14.7 ms plus its deep-watch `traverse` ~11 ms, Vue patching, and GC. The draft storage landed after ticket 11's 31–40 ms measurement (5c563b8), so the invite number is inferred to be the base's, not this change's; not measured at the base.

## Done (Tabulator)

Built 2026-11-26 in `composables/useGridEditor.ts`. **Not Tabulator's `history` module.** Read in its 6.7.1 source, it cannot hold the spec's rules:
- it records `normalizeRow`'s follow-up `row.update` as separate steps, so one ⌘Z after a typed invite line would undo only the last split field;
- `clearData` and `replaceData` wipe it (`rows-wipe`), so Clear could never be undone;
- add and delete are one step per row, and there is no grouping;
- its undo calls `setValueProcessData`, not `setValue`, so no `cellEdited` fires and undone rows never reach `onUserEdit`.

So the Tabulator engine keeps the same model as TanStack: a history of whole-row states (copies, because Tabulator edits rows in place).
- `personWrite(write, reported?)`: the write runs with `cellEdited` commits held back, then `commit` copies the rows, pushes the previous state if any row differs, empties redo, and calls `onUserEdit` once (the path's ids, else the changed ids). Typed edit (`cellEdited`), append paste, overwrite paste, range clear, fill (`rangeEdited`), Add Row, Delete selected and Clear all go through it.
- Undo/redo write the target state back. If the same rows remain, changed rows are `row.update`d in place. Otherwise `replaceData` runs and the ticks of rows that stay are re-applied. Then changed rows are validated and `onUserEdit(changedIds)` is called once.
- Agent writes (`addRows`/`updateRows`/`deleteRows`) re-baseline and empty both stacks.
- Keys on `document` (VueUse `useEventListener`): ⌘/Ctrl+Z, ⌘/Ctrl+Shift+Z, Ctrl+Y. They are ignored inside `input, textarea, select, [contenteditable=true], [role=combobox]` and while a `[role=dialog]` is open. Tabulator's own Ctrl+Z binding is inert because `history` is off.
- After an undo that reloads the data, or after Delete selected removes the active cell's row, the active cell goes back to its row, or to the row now at its place. Tabulator's range would otherwise point at row objects that no longer exist, and the next paste would go nowhere.

Parity with the TanStack side: same scope, same reported ids, same stack-clearing rule, no cap. Differences:
- An undo that reloads the data (undo of Add Row, Delete, Clear, append paste) collapses a multi-cell range to the single active cell. TanStack reconciles the range [inferred from its Done notes, not compared side by side].
- Undo restores rows only, as on TanStack: not the error list Clear emptied, not the Saved badge.

Evidence:
- `useGridEditor.test.ts`: undo/redo of an edit back to 0 changes with `onUserEdit(['r1'])` each time; a new write empties redo; undo of Delete and Add Row restores ids in order; undo of Clear restores both rows; an agent `updateRows` empties both stacks (undo and redo do nothing, no `onUserEdit`); range clear and fill are one step each; ⌘Z inside an input and with a dialog open do nothing; ⌘Z, ⌘⇧Z, Ctrl+Z and Ctrl+Y on the document work; deleting the active cell's row moves it to the row now in its place.
- Browser, real CDP keys and mouse. `/tabulator`: edit Issue → "1 change"; ⌘Z → original, no chip; ⌘⇧Z → back; ⌘Z, Ctrl+Y → back. Range clear of 2×2 → "2 changes", ⌘Z → values back, no chip. Add Row → "11 rows 1 change", ⌘Z → "10 rows", ⌘⇧Z → 11. Delete 3 ticked → "7 rows 3 changes", ⌘Z → "10 rows". Clear → Clear All → "0 rows 10 changes", ⌘Z → "10 rows", Ctrl+Y → 0 rows. Typing then ⌘Z inside an open Issue editor leaves the grid's history alone ("10 rows" kept).
- `/tabulator/invite-users`, lead's extra case. Scripted: `window.scInvite.call` adds Ann (Ready) and an unsplittable line (Needs review). Real: Ann's first name edited to "Anna". Scripted: `update_rows` resolves row B → "Agent proposed", then focus moved to body by script. Real ⌘Z → nothing changed (Anna, Agent proposed). Then real: edit Ann's last name to "Leeson", click Confirm on B → "Ready", ⌘Z → "Lee" back and B still "Ready". Real Send click → "Simulated — no invitations sent (2 valid)".
- Timing at 2,010 rows (`/tabulator`, synthetic keydown → next frame): undo of an edit (in-place path) 24 ms; undo of the 2,000-row paste (`replaceData`) 24 ms; redo of it 69 ms.
