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
