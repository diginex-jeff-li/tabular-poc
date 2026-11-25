# 02 Column defs from Zod + read-only DataGrid

Status: ready-for-agent
Blocked by: 01
Parity: P1, P2

## Change

- `utils/zodToColumnDefs.ts`: a port of `zodToTabulatorColumns` that keeps the same mapping rules (enum → choice editor + `in` rule, nullable drops `required`, own Zod string checks become a validator, uuid/datetime hidden, `titles` override). It emits TanStack `ColumnDef<Row>` with typed `meta`:
  `{ editor: 'text' | 'choice' | null, options?: string[], validate: (value) => string | null, paste: boolean, export: boolean, filter: 'text' | 'choice' | null }`.
- Declare the `ColumnMeta` augmentation for `@tanstack/vue-table` once (`types/tanstack.d.ts`).
- `components/DataGrid/DataGrid.tsx` plus `composables/useDataGrid.ts`: they take the same props as `GridEditor` (see spec decision 2) and render rows read-only with the toolbar shell and the row count chip.
- Temporary route `/next` renders the compliance page on `DataGrid`.

## Acceptance

- `zodToColumnDefs.test.ts` covers the same cases as `zodToTabulatorColumns.test.ts` (ported, not copied wording).
- `/next` shows the 10 seed rows with the same visible columns in the same order as `/`, and fills the height under the nav.

## Done

Built (all under `frontend/apps/admin/src/`):
- `utils/zodToColumnDefs.ts`: `zodToColumnDefs(schema, { titles })` → `GridColumn[]`, same mapping rules as `zodToTabulatorColumns`. `validate(value)` returns `'Required'` for a blank cell in a non-nullable field, `Must be one of: …` for a value outside an enum, the field's own Zod issue message for a string that fails its checks, else `null`. Every derived column has `paste: true`, `export: true`.
- `composables/useDataGrid.ts`: `Row`, `ROW_HEIGHT = 36` (row pitch, border included), `DataGridState`. `rows` is a `shallowRef<ReadonlyArray<Row>>` built from `data`, giving a `crypto.randomUUID()` id to a row without one. `rowCount` is derived.
- `components/DataGrid/DataGrid.tsx` (+ `index.ts`): the `GridEditor` props contract with `columns: GridColumn[]`. `UTable` with `sticky`, `watchOptions: { deep: false }`, `getRowId`, an opaque header (`thead: bg-default`), and columns mapped once in setup. Widths are fixed through `meta.style` (`width`/`minWidth`/`maxWidth`, default 160px). `GridCell` is the full-size cell wrapper carrying `data-row-id`/`data-col-id`; it draws the row line itself (`tbody: divide-y-0`), so every row is exactly `ROW_HEIGHT`. `DataGridToolbar` (title, `toolbarActions`, row count chip) is its own component, so toolbar state never re-renders the component that renders `UTable`.
- `composables/buildComplianceGridColumns.ts`: compliance `GridColumn[]` with fixed widths sized to the seed data.
- `pages/ComplianceGridEditor.tsx`: `engine: 'tanstack' | 'tabulator'` prop (default `tabulator`). `config/router.ts`: temporary `/next` with `props: { engine: 'tanstack' }`.

Deviations:
- Per the lead's decision, the column model is our own `GridColumn`, not TanStack `ColumnDef` + `ColumnMeta`; `types/tanstack.d.ts` is not created (`@tanstack/vue-table` isn't resolvable from the app). `GridColumn` is a union on `editor`: `options` exists only on `choice` columns.
- No `__select` checkbox column yet (ticket 04). `/next` shows the 8 data columns `/` shows, in the same order.
- Props accepted for the contract but not wired yet: `onSave`, `saveLabel`, `savedLabel` (04), `normalizeRow`, `onUserEdit` (05), `pasteParser` (07), `exportFilename` (09), `onReady` (10). Toolbar buttons for those tickets are omitted.
- Not done, needs a call: the 68-line props block is a clone of `GridEditor`'s (jscpd reports it; total duplication 1.56%, under the 5% threshold). One shared props object for both engines would enforce spec decision 1, but it means editing `GridEditor.tsx`.

Evidence (run 2026-11-25):
- `vp test run` on `zodToColumnDefs.test.ts`, `useDataGrid.test.ts`, `ComplianceGridEditor.test.ts`: 3 files, 17 tests passed. `pnpm --filter @sc/admin typecheck`, `pnpm lint`, `vp fmt --check` on touched files: clean.
- Browser (headless Chromium, 1365×768, dev server): `/next` renders 10 rows, chip "10 rows", headers Category Code, Compliance Category, Topic, Risk Level, Issue, Closure Timing, Evidence Expectation, Best Practice. Nav bottom 37px, grid scroll container top 85px, bottom 768px, height 683px (Tabulator on `/`: 683px). Every `tr` is 36px. Each cell wrapper covers its `td` exactly (0px difference both ways). `th` widths equal the configured widths. At 900×300 with `scrollTop` 150 and `scrollLeft` 400, the header stays at the container top and a hit test inside it lands in `thead`. No console errors or warnings. `/` still renders Tabulator. Screenshots: `/tmp/datagrid-next.png`, `/tmp/datagrid-next-scrolled.png`, `/tmp/tabulator-root.png`.
