# Ticket 13: Showcase — CSV/Excel export

> **Label:** `wayfinder:prototype`
> **Type:** Prototype (HITL)
> **Status:** Open — frontier ticket

## Question

Add an "Export to CSV" button to showcase Tabulator's built-in download capability — free in Tabulator, paid in both AG Grid (Enterprise) and RevoGrid (Pro).

### The licensing argument

| Feature | Tabulator (MIT, free) | AG Grid Community | RevoGrid Community |
|---|---|---|---|
| CSV export | ✅ Core (`download` option) | ❌ Enterprise — "Excel Export" is Enterprise only | ❌ Pro — "Excel Export/Import" is Pro |
| Excel (.xlsx) export | ✅ Core (`download` with `xlsx` formatter) | ❌ Enterprise | ❌ Pro |

### What to build

1. **"Export CSV" button** in the toolbar
2. Clicking it downloads the current grid data as a CSV file
3. Optional: "Export Excel" button that downloads as `.xlsx` (Tabulator supports this natively, though it may need the `xlsx` download formatter which uses SheetJS — check if it's included in the core or needs a separate import)

### Implementation

```ts
// CSV export (built-in, no extra deps):
table.download('csv', 'compliance-library.csv');

// Excel export (uses SheetJS under the hood — may need xlsx package):
table.download('xlsx', 'compliance-library.xlsx', { sheetName: 'Compliance Library' });
```

### Acceptance criteria

- Click "Export CSV" → downloads `compliance-library.csv` with all grid data
- Open the CSV in Excel → data matches the grid
- Column headers are included in the export

## Blocked by

(none — frontier ticket)