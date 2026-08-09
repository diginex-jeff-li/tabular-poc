# Ticket 2: Tabulator TSX spike — paste-from-Excel proof

> **Label:** `wayfinder:prototype`
> **Type:** Prototype (HITL)
> **Status:** Open — frontier ticket

## Question

Build a minimal Tabulator grid in the boilerplate's TSX pattern to prove the riskiest unknown: does paste-from-Excel work well enough for an admin workflow?

### What to prove

1. **Grid renders** in a TSX component following the boilerplate convention: `defineComponent` + `setup()` + render function returning `VNode`, with a `<div ref>` and `new Tabulator(el, options)` in `onMounted`. Import `tabulator-tables` + CSS.
2. **Paste from Excel** (Ctrl+V) populates rows correctly. Verify the `table` paste parser maps columns by header title or field name, or falls back to visible-column order. Test with the sample spreadsheet: copy the body (rows 3–102, excluding header row 2), paste into the grid.
3. **Cell editing** works — text editor for free-text columns, select editor for enum columns (`Risk Level`, `Category Code`).
4. **Validation** — apply Tabulator built-in validators (`required`, `in`, `regex`) to columns. Verify `getInvalidCells()` returns invalid cells and `tabulator-validation-fail` CSS class is applied.
5. **`reactiveData: true`** syncs grid with Vue reactive data array.

### Scope

Dummy data matching the compliance library's 8 columns. No backend, no Zod, no save — just prove the grid + paste UX in isolation.

### Key config

```ts
{
  data: [],                    // start empty, paste populates
  reactiveData: true,
  columns: [                   // dummy defs matching the 8 columns
    { title: 'Category Code', field: 'categoryCode', editor: 'select', editorParams: { values: ['A'...'Q'] }, validator: 'required' },
    { title: 'Risk Level', field: 'riskLevel', editor: 'select', editorParams: { values: ['High', 'Medium', 'Low'] }, validator: 'in:High|Medium|Low' },
    // ...
  ],
  clipboard: true,              // enable clipboard
  clipboardPasteParser: 'table', // default: parse as tab-delimited table
  clipboardPasteAction: 'insert', // paste creates new rows
  validationMode: 'highlight',   // flag invalid cells with CSS class
}
```

### Acceptance criteria

- Copy 100 rows from the sample `.xlsx` (body only), paste into the grid → all 100 rows appear with correct column mapping.
- Editing a `Risk Level` cell to an invalid value (e.g., "Critical") flags it with `tabulator-validation-fail`.
- `getInvalidCells()` returns the flagged cell.

## Blocked by

(none — frontier ticket)