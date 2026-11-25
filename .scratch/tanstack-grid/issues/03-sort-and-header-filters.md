# 03 Sorting and header filters

Status: ready-for-agent
Blocked by: 02
Parity: P3, P4

## Change

- Sorting through `getSortedRowModel`, cycling asc → desc → none. Sorting is triggered only by a sort icon button in the header. The header cell itself is left free for column selection (ticket 06).
- Filters through `getFilteredRowModel`: `meta.filter === 'text'` gets a `UInput` with a "Filter…" placeholder (case-insensitive contains); `'choice'` gets a clearable `USelect` over `meta.options` (exact match). Status and checkbox columns get none.
- Filtering and sorting are views. Row ids and the `rows` array order are untouched, so the `GridApi` and the dirty diff are unaffected.

## Acceptance

- Component test: clicking the sort icon three times gives asc, desc, original order.
- Component test: an enum filter shows only matching rows; clearing restores all.
- Typing in a filter input never triggers grid keyboard handlers (relevant once ticket 06 lands).

## Done

Built (under `frontend/apps/admin/src/`):
- `components/DataGrid/HeaderCell.tsx`: title, a tristate sort `UButton` (`column.toggleSorting(undefined, false)`, icon and `aria-label` follow the state), and the filter. Only the button sorts, so a click on the rest of the header can select the column later (ticket 06).
- `DataGrid.tsx`: data columns get `enableSorting: true`, `sortingFn: 'alphanumeric'`, `sortDescFirst: false` (TanStack would otherwise sort a column descending first when its first value isn't a string), `filterFn: 'includesString'` for text (case-insensitive contains) or `'equals'` for choice. `sorting` and `columnFilters` are controlled `ref`s that start as `[]`. `rows` and its order never change.
- `composables/buildComplianceGridColumns.ts`: Category Code, Compliance Category, Risk Level and Closure Timing are each 24px wider, so the title fits next to the sort button. Main approved this.

Deviations:
- The choice filter is `USelectMenu` with `clear` and `searchInput={false}`, not `USelect`. `USelect` has no clear control, and `USelectMenu` is the select ticket 05 uses for editors.
- For ticket 06: the `USelectMenu` trigger is a `button` with `aria-haspopup="listbox"` and **no** `role="combobox"`. The planned bail-out `input,textarea,select,[role=combobox],[data-grid-editor]` would miss it. Add `button` (the spike's header pointerdown guard already did) or `[aria-haspopup]`.
- Empty values sort last when ascending and first when descending (TanStack `alphanumeric`).

Evidence (2026-11-25):
- `DataGrid.test.ts` (real `UTable` + Nuxt UI in happy-dom): 3 sort clicks give asc, desc, original (data picked so desc ≠ original; `aria-sort` back to `none`); Risk = Low shows 1 row, trailing clear shows all 3; text filter `LAB` matches `Child labor`.
- Browser `/next`: Category Code sort gave `B..Q,''`, `'',Q..B`, then the original order. Issue filter `LABOR` gave the 2 labor rows; clearing gave all. Category Code = B gave 1 row; the clear `x` gave all, with no menu left open. After the width change every header title has `scrollWidth == clientWidth` (screenshot `/tmp/datagrid-next-headers.png`). No console errors.
