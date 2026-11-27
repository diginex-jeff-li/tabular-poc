# 10 GridApi adapter and the bulk invite page

Status: resolved
Blocked by: 07, 08, 09
Parity: P17, P18, P19

## Change

- `useDataGrid` exposes `GridApi` through `onReady`:
  - `getRows` returns copies;
  - `addRows` adds fresh ids and runs `normalizeRow`;
  - `updateRows` merges, runs `normalizeRow`, and reports `missing`;
  - `deleteRows` reports `missing` and prunes errors;
  - `showErrors` sets the error list.
  
  It matches `memoryGridApi` behaviour.
- Invite Status column (TanStack build): `columnPinning.left: ['status']`, read-only, the cell renders the `STATUS_CLASS` label plus a `UButton` "Confirm" on agent-proposed rows that calls `draft.confirm(rowId)`; `meta.paste=false`, `meta.export=false`. The Tabulator build keeps its HTML-string formatter and `cellClick` for the comparison routes.
- `BulkInviteUsers.tsx` gains the `engine: 'tanstack' | 'tabulator'` prop from ticket 12 now, so the page is never copied. `'tanstack'` builds columns with `zodToColumnDefs` and renders `DataGrid`; `'tabulator'` (the default until ticket 12) keeps today's path. Everything else on the page (agent tools, WebMCP registration, mapping panel, Excel template/import/download, notices) is shared and unchanged. A temporary `/next/invite-users` route mounts it with `engine="tanstack"`.

## Acceptance

- `inviteDraft`, `inviteAgentTools`, `columnMapping`, `draftRow` and `memoryGridApi` tests pass without edits.
- Real-browser check: `window.scInvite.call('add_rows', …)` and an `update_rows` that resolves a needs-review row → the row shows "Agent proposed" + Confirm → Confirm → Ready. The Send gate behaves as on Tabulator.

## VueUse (spec decision 8)

- Excel import: `useFileDialog({ accept: '.xlsx', multiple: false, reset: true, input: fileInputEl })` plus `onChange(fl => importFile(fl?.[0]))`. Passing `input` keeps the existing hidden input and its `data-testid="invite-import"`.
- `downloadXlsx`: `useObjectUrl`, with the same `nextTick` and test caveats as ticket 09.
- No `useDropZone`: drag-and-drop import isn't parity.

## Done

Built 2026-11-25 (with ticket 12 step 2 and the invite half of step 1). Under `frontend/apps/admin/src/`:
- `utils/gridApi.ts`: `GridApi`, `GridSaveError`, `GridSaveResponse`, moved out of `composables/useGridEditor.ts`. Every importer now imports from here (both engines, `gridEngineProps`, `useDataGrid`, `gridValidation`, `validateInvites`, `inviteDraft`, `memoryGridApi`, the page). There is no re-export.
- `composables/useDataGrid.ts`: `api: GridApi`. `getRows` returns copies. `addRows` is the existing `addRows` (fresh ids, `normalizeRow`). `updateRows` merges each patch in order through `normalizeRow`, keeps untouched rows' identity and reports `missing`. `deleteRows` reports `missing` (a repeated id counts as missing, as in `memoryGridApi`) and drops those rows' ticks and errors. `showErrors` sets `errorList`. No api write calls `onUserEdit`, the same as Tabulator's `useGridEditor` api. `deleteSelected` shares the new `removeRows`. `DataGrid` calls `onReady(grid.api)` in setup, as `GridEditor` does.
- `GridColumn` (`utils/zodToColumnDefs.ts`) gains `pinned?: boolean` and, on read-only columns only, `render?: (row) => VNode`. A render column can't be sorted, and `HeaderCell` hides its sort button.
- Status reactivity: `draft.status` reads the draft's plain `errors` and `agentProposed`, which Vue doesn't track. Every draft change ends in `check()` → `showErrors(new array)`, so `GridCell` reads `saveErrors` while rendering a render column. The status cell then re-renders on row changes and on every `showErrors`, the same trigger as Tabulator's `reformat`. Data cells don't take this dependency.
- `DataGrid` screen order: pinned columns, the checkbox column, then the rest. Navigation order (`colIds`), `aria-colindex` and `reveal`'s `th` lookup follow it. `columnPinning={ left: pinned ids }`, and pinned `th`/`td` get `bg-default`. `reveal` keeps a scrolled-to cell right of the pinned width.
- `pages/BulkInviteUsers.tsx`: `engine: 'tanstack' | 'tabulator'` (default `tabulator`). One `gridProps` object and the whole page are shared. Only `gridColumns(draft)` (Status `GridColumn` with a `UButton` "Confirm" → `draft.confirm`, `paste: false`, `export: false`, width 215, pinned) and `tabulatorColumns(draft)` (today's formatter + `cellClick`) differ. The `tabulator_modern` even-row `<style>` now renders only on the Tabulator path. `config/router.ts`: temporary `/next/invite-users` with `props: { engine: 'tanstack' }`.
- VueUse, both switched with the same behaviour. `useFileDialog({ accept, multiple: false, reset: true, input: fileInput })` drives the existing hidden input (`data-testid="invite-import"` kept, JSX `accept`/`onChange` removed). VueUse sets `input.onchange`, and `reset` clears the value before each pick, which replaces the old `input.value = ''` after the read, so the same file can be picked twice. `downloadXlsx` uses `useObjectUrl` + `nextTick`, as ticket 09 does. The URL is revoked on the next download or on unmount, not right after `click()`.

Deviations: none from parity. Ticket 08's whole-row block includes Status, and `clearCells` skips it (read-only), so this holds with Status pinned first.

Evidence (2026-11-25):
- No edits to `inviteDraft.test.ts` (12), `inviteAgentTools.test.ts` (7), `columnMapping.test.ts` (8), `draftRow.test.ts` (28). All pass; `memoryGridApi` has no test file of its own and runs inside the first two. Full admin suite: 24 files, 285 tests pass.
- `useDataGrid.test.ts` +5 (21 total): copies, fresh ids without `onUserEdit`, in-order merge + normalize + `missing` + identity + dirty, delete with `missing`/ticks/errors pruned, `showErrors` replaces.
- New `pages/BulkInviteUsers.test.ts` (3, TanStack engine only: no BulkInviteUsers test existed, and the Tabulator engine is mocked in unit tests). Status is the first `th`. Agent `add_rows` gives "Needs review", `update_rows` gives "Agent proposed" + Confirm, Send is blocked (no "Simulated" badge), Confirm gives "Ready", Send shows "Simulated — no invitations sent (1 valid)". An alias header paste maps by name, a positional paste lands past Status, and an unmapped table shows "Apply mapping" with nothing added. An `.xlsx` built by `buildInviteWorkbook` and set on `[data-testid=invite-import]` + `change` imports through `useFileDialog`.
- `pnpm --filter @sc/admin typecheck`, `pnpm lint`, `vp fmt --check` on touched dirs: clean. `pnpm jscpd`: 0 tsx clones. The one clone is `vite.config.ts` ↔ `vitest.config.ts`, which predates this change.
- Browser (omp headless Chromium, dev server). Scripted: the `window.scInvite.call` agent calls and `navigator.clipboard.writeText`. Real CDP input: every click, Cmd+V (`page.keyboard` with the `paste` command), the native file chooser and the downloads.
  - Send gate, the same script on both routes. `/next/invite-users` and `/invite-users` gave identical states. After `update_rows`: "Agent proposed" + Confirm, "1 rows 1 change 1 errors", sidebar "Validation Errors (1)". Send (real click): unchanged and blocked. Confirm (real click): "Ready", no errors. Send: "Simulated — no invitations sent (1 valid)", Send disabled.
  - Paste on `/next/invite-users`, all real Cmd+V. Empty-grid overlay click focuses the root. `E-mail / Given name / Surname / Permission / Extra` → 1 row mapped by name, "Ready", notice "Ignored columns: Extra". A 6-column table with no header → mapping panel and no row added; Discard (real) closes it. Auto-match unticked (real), then `bo@acme.com\tBo\tKim\tViewer` → positional row, "Ready", Status untouched. With Auto-match off, a header paste is held with an empty mapping; mapping it with the panel's `select`s and Apply → "Added 1 pasted row(s)". URL unchanged throughout.
  - Excel: "Download as Excel" (real click) saved `invite-users.xlsx` (8,082 bytes) through `useObjectUrl`. After Clear → Clear All, importing it (`DOM.setFileInputFiles` on the hidden input) gave the 2 rows and "Imported 2 row(s) from invite-users.xlsx; 0 error(s) to fix". "Import .xlsx" (real click) opened the native chooser (`waitForFileChooser`), and the same file imported again.
  - Pinned Status at 800×600 with `scrollLeft` 259: the status cell stays at x=0 with an opaque `rgb(255,255,255)` `td`, and a hit test lands on it. Clicking sidebar "Row 3: email" scrolled to `scrollLeft` 44, with the email cell at x=215, flush against Status's right edge, and a hit test on it.
  - Agent `delete_rows([id, 'nope'])` → `deleted [id]`, `missingIds ['nope']`. No console errors or warnings on `/next/invite-users`.
  - Screenshots: `/tmp/invite-next-proposed.png`, `/tmp/invite-next-sent.png`, `/tmp/invite-next-paste.png`, `/tmp/invite-next-pinned.png`.
