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
