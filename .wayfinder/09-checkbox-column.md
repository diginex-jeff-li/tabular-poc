# Ticket 09: Checkbox column for row selection

> **Label:** `wayfinder:prototype`
> **Type:** Prototype (HITL)
> **Status:** Open — frontier ticket

## Question

Replace the current `selectable: true` (click-to-highlight) with a dedicated checkbox column on the left side of the grid, like Excel row selectors. The admin checks rows they want to delete, then clicks "Delete Selected".

### What to build

1. **Checkbox column** as the first column in the grid — a checkbox in each row + a "select all" checkbox in the header
2. Tabulator supports this via the `selectableRowRange` + formatter approach, or via a custom formatter with a checkbox input
3. "Delete Selected" button reads which rows are checked (not just highlighted) and deletes them
4. Mark deleted rows as `'deleted'` in dirty tracking
5. Remove from the grid

### Implementation approach

Tabulator's built-in row selection can be combined with a formatter:

```ts
{
  title: '',
  field: '__selected',
  width: 40,
  hozAlign: 'center',
  formatter: 'rowSelection', // Tabulator built-in: renders checkbox
  titleFormatter: 'rowSelection', // renders "select all" in header
  cellClick: (e, cell) => {
    cell.getRow().toggleSelect();
  },
}
```

Then `table.getSelectedRows()` returns the checked rows.

### Acceptance criteria

- A checkbox column appears on the left side of the grid
- Clicking a checkbox selects that row (checkbox checked, row highlighted)
- Clicking the header checkbox selects/deselects all rows
- Click "Delete Selected" → all checked rows are removed
- Dirty counter reflects the deletions
- Save button becomes enabled (dirty > 0)

## Blocked by

(none — frontier ticket)