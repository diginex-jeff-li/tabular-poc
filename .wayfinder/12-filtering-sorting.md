# Ticket 12: Showcase — column filtering + sorting

> **Label:** `wayfinder:prototype`
> **Type:** Prototype (HITL)
> **Status:** Closed — resolved 2026-08-10 (commit 34c2ed72)

## Question

Add column filtering and multi-column sorting to the grid to showcase features that are free in Tabulator but paid in the alternatives.

### The licensing argument

| Feature | Tabulator (MIT, free) | AG Grid Community | RevoGrid Community |
|---|---|---|---|
| Column filtering | ✅ Core (`FilterPlugin`) | ✅ Community (basic) | ❌ Pro — "Header Input Filtering", "Date Filter", "Advanced Selection Filtering" all Pro |
| Multi-column sorting | ✅ Core (`SortingPlugin`) | ✅ Community | ❌ Pro — "Column Group Reorder" is Pro |

### What to build

1. **Column header filters** — text input in the header of each column that filters rows as you type. Tabulator's `filter` option with `headerFilter: true` on each column.
2. **Multi-column sort** — click column headers to sort (already works via `headerSort: true` which is Tabulator default). Showcase shift+click for multi-column sort.
3. Add a small info banner: "All features free (MIT) — no paid tier" to make the licensing advantage visible.

### Implementation

```ts
// Add to each data column definition:
headerFilter: true, // enables per-column header filter input

// For enum columns, use a select filter:
headerFilter: 'list',
headerFilterParams: { values: enumValues },
```

### Acceptance criteria

- Each column header has a filter input below the title
- Typing in the Issue filter → rows filter live
- Selecting a value in the Risk Level filter → rows filter to that risk level
- Clicking a column header sorts by that column
- Shift+clicking a second column header adds a secondary sort

## Blocked by

(none — frontier ticket)