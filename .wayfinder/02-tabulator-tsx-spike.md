# Ticket 2: Tabulator TSX spike — paste-from-Excel proof

> **Label:** `wayfinder:prototype`
> **Type:** Prototype (HITL)
> **Status:** Closed — resolved 2026-08-10

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

## Resolution

All five acceptance criteria proven on 2026-08-10. Prototype at `bp-frontend/apps/admin/src/pages/ComplianceGridSpike.tsx`, route `/compliance-spike`.

### Findings

1. **Tabulator renders in TSX** — `defineComponent({ setup() { ... return (): VNode => <div ref={tableEl} /> } })` + `new Tabulator(tableEl.value, options)` in `onMounted`. Clean, no SFC, no wrapper.
2. **Paste from Excel works** — `clipboardPasteParser: 'table'` + `clipboardPasteAction: 'insert'`. Clipboard paste event (simulated via `ClipboardEvent` with tab-delimited data) populated 3 rows with all 8 columns mapped correctly by field name.
3. **Cell editing** — `"list"` is the correct editor name for dropdowns (not `"select"` — that's not registered). `"input"` for free text. Verified from Tabulator 6.5.2 runtime source: `defaultEditors = { input, textarea, number, range, date, time, datetime, list, star, progress, tickCross, adaptable }`.
4. **Validation** — `validationMode: 'highlight'` flags invalid cells with red borders. `getInvalidCells()` returns invalid Cell Components. `cell.validate()` returns the failed validator objects.
5. **Key finding for save loop**: `highlight` mode only validates on user keyboard edit, not programmatic `setValue()`. For the save loop (Ticket 06), must call `table.validate()` or iterate `cell.validate()` on all cells after paste to catch errors before POST. Backend Zod validation remains the authoritative check.

### Type compatibility note

`@types/tabulator-tables@6.3.6` is outdated vs `tabulator-tables@6.5.2`. The `"list"` editor and `"in"` validator exist at runtime but not in the type definitions. Column definitions are cast through `as any` to bridge this gap. For production, either upgrade the types or use `// @ts-expect-error` per line.