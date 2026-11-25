# 09 CSV export

Status: ready-for-agent
Blocked by: 02
Parity: P16

## Change

- `utils/csv.ts`: `buildCsv(rows, columns)` takes every row in `rows` order (ignoring filters and sort, per VAL-GRID-022) and the columns with `meta.export !== false`. Header is the column titles; comma delimiter; RFC 4180 quoting (quotes, commas, line breaks).
- Export button → Blob → download using the `exportFilename` prop.

## Acceptance

- Unit test: a value with a comma, a quote and a line break round-trips through a CSV parser; Status and `__select` are absent; filtered-out rows are present.

## VueUse (spec decision 8)

- `const url = useObjectUrl(blob)`. Set `blob.value`, `await nextTick()` (the URL is created by a watcher), then set `a.href = url.value` and `a.click()`. Revocation happens on the next blob or on unmount.
- Test trap: happy-dom's `Blob` is cross-realm to Node's `URL.createObjectURL` and throws `ERR_INVALID_ARG_TYPE`. Stub `URL.createObjectURL`; assert on `buildCsv` output, not on the download.

## Pure module (done)

`utils/csv.ts` (tests: `csv.test.ts`, round-trip through a small RFC 4180 reader in the test). Not wired yet.

```ts
buildCsv(rows: ReadonlyArray<Row>, columns: ReadonlyArray<GridColumn>): string
```

- Header = column titles; columns with `export: true` only; rows in the given order (pass `rows.value`, not the table's filtered model).
- Quotes only fields with `"`, `,`, `\r` or `\n` (RFC 4180). Line ends are CRLF; Tabulator joined with `\n` and quoted every field. Both parse the same. No BOM, as before.

## Done

Built 2026-11-25. `components/DataGrid/DataGridToolbar.tsx` has an "Export" button (same label and place as `GridEditor`: after the separator, before Clear). It takes the new `columns` and `exportFilename` props from `DataGrid`. Click → `csv.value = new Blob([buildCsv(grid.rows.value, columns)], { type: 'text/csv;charset=utf-8' })` → `await nextTick()` → an `<a>` with `href = useObjectUrl(csv).value` and `download = exportFilename` → `click()`. The URL is revoked by `useObjectUrl` on the next export or on unmount.

Deviations: none.

Evidence (2026-11-25):
- `DataGrid.test.ts`: `URL.createObjectURL`/`revokeObjectURL` and `HTMLAnchorElement.prototype.click` are stubbed. With Topic filtered to `w` (1 row visible), Export clicks one link with `download="grid.csv"` and `href="blob:csv"`. The blob text is `Topic,Risk\r\nChild labor,Low\r\nWages,High\r\nAir quality,High`: every row and no Status column.
- Browser `/next`, real CDP clicks, download captured through CDP `Browser.setDownloadBehavior`: Issue filtered to `prison` (1 row visible) → `compliance-library.csv`, 11 lines (header + all 10 rows). The first lines are `Category Code,Compliance Category,Topic,Risk Level,Issue,Closure Timing,Evidence Expectation,Best Practice` then `A,Governance,,,Facility operating without valid business license,30,Evidence within 30 days,`. The empty Topic/Risk Level are the cells cleared in ticket 08's check.
