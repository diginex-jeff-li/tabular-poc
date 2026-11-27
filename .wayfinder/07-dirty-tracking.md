# Ticket 7: Dirty tracking for diff-based upsert

> **Label:** `wayfinder:task`
> **Type:** Task (AFK)
> **Status:** Closed — resolved 2026-08-10 (commit 4d7cef45)

## Question

Track added/modified/deleted rows in the Tabulator grid to build the diff-based upsert payload for the save loop (Ticket 6).

### Tracking model

Maintain a reactive `Map<rowId, 'added' | 'modified' | 'deleted' | 'unchanged'>`:

- **Added** — rows pasted from Excel or inserted via the grid's "Add Row" button. These have temporary client-side IDs (e.g., `crypto.randomUUID()`). On save, they go into `upserts` with their temp ID; the backend assigns the real UUID and returns it.
- **Modified** — existing rows (loaded from backend) where a cell was edited. Tracked via Tabulator's `cellEdited` event. On save, they go into `upserts` with their existing backend ID.
- **Deleted** — rows removed via the grid's delete action. Tracked via Tabulator's `rowDeleted` event (or a custom delete button). On save, their IDs go into `deletes`.
- **Unchanged** — rows loaded from backend with no edits. Excluded from the payload.

### Tabulator events to hook

```ts
table.on('cellEdited', (cell) => {
  const rowId = cell.getRow().getData().id;
  if (dirtyMap.get(rowId) !== 'added') {
    dirtyMap.set(rowId, 'modified');
  }
});

table.on('rowAdded', (row) => {
  dirtyMap.set(row.getData().id, 'added');
});

// rowDeleted needs custom wiring — Tabulator doesn't have a built-in rowDeleted event
// Use a custom delete button in the row formatter that calls row.delete()
// and records the ID before deletion.
```

### Building the payload

```ts
function buildSavePayload(): BulkSaveRequest {
  const upserts: ComplianceLibrary[] = [];
  const deletes: string[] = [];

  for (const [id, status] of dirtyMap) {
    if (status === 'deleted') {
      deletes.push(id);
    } else if (status === 'added' || status === 'modified') {
      const rowData = table.getRow(id)?.getData();
      if (rowData) upserts.push(rowData);
    }
  }

  return { upserts, deletes };
}
```

### Post-save cleanup

On successful save (`{ errors: [], saved: N }`):
1. Clear `dirtyMap` — all rows are now `unchanged`.
2. If the backend returned new IDs for added rows, update the grid's row data with the real IDs (re-fetch from backend or apply returned ID mapping).

### Acceptance criteria

- Load 100 rows from backend (all `unchanged`).
- Paste 10 new rows → 10 entries in `dirtyMap` as `added`.
- Edit 2 existing rows → 2 entries change to `modified`.
- Delete 1 row → 1 entry as `deleted`.
- `buildSavePayload()` returns `{ upserts: [12 rows], deletes: [1 id] }`.

## Blocked by

- Ticket 2 (Tabulator TSX spike — need the grid events working)