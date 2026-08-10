# Ticket 08: Add Row button — create rows in UI

> **Label:** `wayfinder:prototype`
> **Type:** Prototype (HITL)
> **Status:** Open — frontier ticket

## Question

Add an "Add Row" button to the toolbar that inserts a new blank row into the Tabulator grid. The admin should be able to create rows directly in the UI without copy-pasting from Excel.

### What to build

1. **"Add Row" button** in the toolbar (next to Save, Delete Selected, Clear)
2. Clicking it inserts a new blank row with a generated UUID (`crypto.randomUUID()`)
3. The new row is immediately editable — admin clicks into cells to fill it
4. The new row is marked as `'added'` in dirty tracking so Save includes it
5. The new row's enum cells default to empty — admin picks from the dropdown (list editor)
6. Optional: pre-fill enum fields with placeholder text or the first enum value

### Implementation notes

Tabulator's `addRow()` method inserts a row:
```ts
table.addRow({ id: crypto.randomUUID() }); // all other fields default to undefined
```

After adding, mark it dirty:
```ts
markDirty(newRowId, 'added');
```

The row should be added at the top or bottom (user preference — suggest top for visibility).

### Acceptance criteria

- Click "Add Row" → a new blank row appears at the top of the grid
- Click into any cell → the appropriate editor opens (list for enums, input for text)
- Fill the row with valid data → Dirty counter increments
- Click Save → row is validated and saved (or errors show if invalid)
- Fill the row with invalid data → Save shows validation errors per-cell

## Blocked by

(none — frontier ticket)