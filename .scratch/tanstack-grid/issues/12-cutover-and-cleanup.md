# 12 Cutover: TanStack by default, Tabulator kept for comparison, custom tables deleted

Status: ready-for-agent
Blocked by: 11

## Decision (user)

Keep the Tabulator versions of the compliance grid and bulk invite pages next to the TanStack ones, so they can be compared like for like. TanStack is the default. Custom tables are deleted.

| Route | Engine |
|---|---|
| `/` | TanStack (`DataGrid`) |
| `/invite-users` | TanStack (`DataGrid`) |
| `/tabulator` | Tabulator (`GridEditor`), compliance |
| `/tabulator/invite-users` | Tabulator (`GridEditor`), bulk invite |

## Change

1. **One page, two engines.** `ComplianceGridEditor.tsx` and `BulkInviteUsers.tsx` each take an `engine: 'tanstack' | 'tabulator'` prop (set by the route).
   - The engine picks the grid component (`DataGrid` or `GridEditor`) and the column builder (`zodToColumnDefs` or `zodToTabulatorColumns`, with `buildComplianceColumns`).
   - For the invite Status column, the TanStack build renders a cell with `UButton`; the Tabulator build keeps today's formatter and `cellClick`.
   - Everything else is shared, written once: agent tools, WebMCP registration, mapping panel, Excel template/import/download, notices, the mock backend.
   - Don't copy a page per engine: jscpd would flag it, and the two would drift.
2. **Shared types:** move `GridApi`, `GridSaveError` and `GridSaveResponse` from `composables/useGridEditor.ts` to `utils/gridApi.ts`. Both engines and `inviteDraft`, `inviteAgentTools`, `memoryGridApi` and `BulkInviteUsers` import from there.
3. **Routes and nav:**
   - add the two `/tabulator*` routes (lazy, so the Tabulator chunk and CSS load only there);
   - add one nav entry ("Tabulator (comparison)") that links to them;
   - remove the `/next` route.
4. **Tabulator CSS:** move `import 'tabulator-tables/dist/css/tabulator_modern.min.css'` out of `main.ts` into the Tabulator `GridEditor` module, so TanStack pages don't load it.
5. **Delete custom tables:**
   - `pages/CustomTable*.tsx` and their tests;
   - the `/custom*` routes and nav links;
   - `utils/definitionToColumns.ts` and its test;
   - `types/customTable` and `composables/useTableDefinitions.ts`, if nothing else imports them.
   
   Then run `pnpm knip` and delete what it reports as newly unused.
6. **Keep on the Tabulator side:**
   - `GridEditor` (with its "Why Tabulator?" panel), `useGridEditor`, `useDirtyTracking` and their tests;
   - `zodToTabulatorColumns`, `buildComplianceColumns`;
   - `tabulator-tables` and `@types/tabulator-tables`.
   
   Mark these as **comparison-only** in AGENTS.md. New grid work goes to `DataGrid` only.
7. **Docs:**
   - AGENTS.md: project blurb, the Tabulator convention paragraph, Key Files (both engines and the route table above), and the VueUse note (explicit imports, no auto-import);
   - `CONTEXT.md` and ADR mentions;
   - the comments in `inviteDraft.ts` and `memoryGridApi.ts` that name the adapters.

## Acceptance

- `pnpm validate`, `pnpm knip` and `pnpm jscpd` pass. jscpd confirms the pages aren't duplicated per engine.
- `/` and `/invite-users` load no Tabulator code or CSS: in the network panel, no `tabulator` chunk or stylesheet.
- The full parity matrix in `spec.md` is run in a real browser on **both** engines, with each row ticked per route in a comment on this ticket. Any row where the two engines differ is listed: that list is the comparison.
- Agent tools work on both invite routes. Only one page is mounted at a time, so `window.scInvite` and the WebMCP registration don't clash. Check that leaving one route unregisters its tools before the other registers.

## Ending the comparison (later, separate change)

When the comparison is done, removing Tabulator is one deletion with no page changes:
- the `/tabulator*` routes and their nav entry;
- the `engine` prop and its `'tabulator'` branches in `ComplianceGridEditor.tsx` and `BulkInviteUsers.tsx` (including the Tabulator Status formatter and `cellClick`);
- `components/GridEditor/`, `composables/useGridEditor.ts`, `useDirtyTracking.ts`, `buildComplianceColumns.ts`, `utils/zodToTabulatorColumns.ts`, and their tests;
- `tabulator-tables` and `@types/tabulator-tables`.

Afterwards, `rg -i tabulator frontend contracts` finds only history (`.wayfinder/`, `.scratch/`, CHANGELOG), and `pnpm validate` and `pnpm knip` pass.

## Done (partial, with ticket 10)

- Step 1, invite page: `BulkInviteUsers.tsx` takes `engine`. Only the grid component and the column builder differ (see ticket 10's `## Done`). The page still defaults to `tabulator`. `/invite-users` stays Tabulator and `/next/invite-users` is TanStack until the route switch in step 3.
- Step 2: `GridApi`, `GridSaveError`, `GridSaveResponse` live in `utils/gridApi.ts`. Every importer is migrated and the old exports are deleted.

## Parity run

Run 2026-11-25/26 against the dev server (http://localhost:3500) at `e433a28` (after the lazy `GridEditor` fix). omp headless Chromium, 1365×768 unless stated. Every click, double-click, drag, wheel and key is real CDP input, including Cmd+C and Cmd+V (sent with the `copy`/`paste` editing commands, which is how Chrome on macOS maps them). Scripted, read-only: DOM reads, `navigator.clipboard.writeText/readText`, `window.scInvite.call`, a CDP logpoint in `mockBulkSave` that logs `payload` (P7), a `registerTool` logging wrapper installed as an init script (agent tools), and accepting the native file chooser with a path (P19). T = TanStack (`/`, `/invite-users`), B = Tabulator (`/tabulator`, `/tabulator/invite-users`).

Read this first: **SPA navigation between the two engines of the same page keeps the old engine** (bug 1 below). Each route was therefore checked after a full page load.

Bugs found (repro steps in the run report):
1. Nav between `/` ↔ `/tabulator` or `/invite-users` ↔ `/tabulator/invite-users` keeps the engine already mounted, in both directions. The router reuses the page component, and `engine` is read once in `setup`.
2. (Fixed in `e433a28`) TanStack routes loaded `tabulator-tables` and its CSS.
3. Tabulator Clear: the dialog is empty and its buttons can't be clicked. This predates the cutover (ticket 04).
4. Tabulator empty state: an overlay click doesn't focus the grid, so Cmd+V does nothing.
5. Tabulator compliance CSV: an empty leading column, because `__select` has no `download: false`.

| # | TanStack | Tabulator |
|---|---|---|
| P1 | pass. 8 data columns, titles `Category Code` … `Best Practice`. No `id`/`createdAt`/`updatedAt` column | pass. Same 8 fields and titles, plus `__select` |
| P2 | pass. Grid 85→768 (683px) at 1365×768 and 85→500 (415px) at 1000×500, no page scroll. Chip `10 rows` | pass. Same heights at both sizes. Chip `10 rows` |
| P3 | pass. Issue order: original → reversed → original over 3 sort-button clicks, `aria-sort` back to `none`. A header-title press selects the 10 Issue cells and keeps the order | pass. Same 3 orders through the header icon. A title press selects the 10 Issue cells, order kept |
| P4 | pass. `LABOR` → the 3 labor rows. Risk `Medium` → 1 row. Trailing × → 10 rows, menu closed | pass. `LABOR` → same 3 rows. List `Medium` → 1 row. Escape (or the native × shown on focus) → 10 rows |
| P5 | pass. Ticks on rows 0 and 2, header `mixed`. A data-cell click leaves ticks alone. Select-all ticks 10, again 0 | pass. Same ticks, header indeterminate, cell click leaves ticks. Partial-state header click differs (see differences) |
| P6 | pass. Add Row puts a blank row on top (`9 rows 4 changes`). Delete removes ticked rows. Clear opens "Clear all rows? This will remove all 10 rows…"; Escape keeps 10; Clear All → `0 rows 10 changes` | **fail on Clear** (bug 3). Add Row on top and Delete work the same. Clear opens an empty dialog; Cancel/Clear All render behind the overlay and can't be clicked |
| P7 | pass. Edit + 2 deletes → `3 changes`, Save enabled. Payload `{upserts:[row 2, all 11 fields, "… EDITED"], deletes:[row 0, row 1]}`. `Saved 3`, Save disabled. Next edit → `1 change`, badge gone. Reload: `beforeunload` when dirty, none when clean | pass. Same chips, same payload shape (1 upsert with 11 fields, 2 deletes), `Saved 3`, badge cleared by the next edit, same `beforeunload` behaviour |
| P8 | pass. Enter opens the text editor, Escape restores, typing `Zed` on a cell opens the editor with `Zed` and Enter commits and moves down, Tab commits and moves right. Enum: double-click lists High/Medium/Low, Escape keeps High, picking Low commits (`1 change`) | **partial.** Enter/double-click open, Escape restores, Enter/Tab commit and move, enum list works (High/Medium/Low, Escape, pick Low). **Typing on a selected cell does not start an edit** (nothing happens) |
| P9 | pass. Typing `nora@acme.com Nora Hill Viewer` into Email splits into the 4 fields, `Ready`. Agent `Needs review` → `update_rows` → `Agent proposed` → a person edit of Last Name → `Ready` | pass. Identical split and identical status sequence |
| P10 | pass. Cleared Issue: `aria-invalid`, `title="Required"`, red ring. Backend errors: 8 entries, `bg-error/10`. At 1000×400, sorted so the blank row is last, "Row 1: evidenceExpectation" → `scrollTop` 149, `scrollLeft` 1080, cell inside the grid and hit-tested, 3px `rgb(231,0,11)` outline, gone after 2.3 s, active cell, grid focused | **partial.** Cleared Issue: `tabulator-validation-fail` red border. Backend errors: 8 entries, `.backend-validation-error`. Same click scrolls rows (`scrollTop` 183) and outlines the cell (removed after 2 s), but **does not scroll horizontally**: the cell stays at x=1568 in a 1000px viewport. Active cell and focus don't move |
| P11 | pass. Click topic@1, ↓ → topic@2, → riskLevel@2, Tab issue@2, Shift+Tab riskLevel@2. Shift+↓→ 4 cells, Shift+click 9, drag 8 (topic..riskLevel ×4). Row press beside the checkbox → 8 cells, 0 ticks | pass. Identical moves and range sizes. Row press on the `__select` cell's left edge → 8 cells, 0 ticks |
| P12 | pass. `Key Compliance Requirements\tMedium\nZero Tolerance Policy\tHigh`. Whole row → 8 values, trailing empty | pass. Byte-identical clipboard for both copies |
| P13 | pass. Compliance: 2 positional rows appended at the bottom with fresh ids, `12 rows 2 changes`. Invite: alias headers → `ann@acme.com` row `Ready` + "Ignored columns: Extra."; 6-column table held with "Apply mapping", Discard adds nothing; Auto-match off → positional `bo@acme.com` row `Ready` | pass. Same rows and positions, same invite notices and held table (ids not inspected) |
| P14 | pass on both pages. Empty grid → overlay click focuses the grid root (`tabindex=0`) → Cmd+V adds the row, overlay gone, URL unchanged | **fail** on both pages (bug 4). An overlay click leaves focus on `<body>`. Cmd+V does nothing. Only Tab-key focus on `.tabulator-tableholder` then Cmd+V pastes |
| P15 | pass. Compliance: topic..riskLevel × rows 0–1 cleared, invalid, `2 changes`, row 2 untouched, 2nd Delete is a no-op, history/URL unchanged. Invite: whole rows 0–1 (Status included in the range) → fields cleared, Status `Not ready`, row 0's tick kept, agent-proposed row now `Not ready`, row 2 untouched | pass. Same compliance result. Invite: whole-row press is on the Status cell (Tabulator row header); same cleared fields, statuses, tick kept, history unchanged |
| P16 | pass. Issue filter `prison` (1 visible) → `compliance-library.csv`, header + 10 rows, comma, CRLF. Invite: Status excluded, both rows exported under a filter | **fail on compliance** (bug 5): an extra empty leading column (`"","Category Code",…`) from `__select`. Invite CSV is correct (Status and `__select` excluded). All rows exported under a filter on both pages |
| P17 | pass. Status is the first `th`; double-click/typing on it opens nothing. At 800×600 with `scrollLeft` 259 the Status cell stays at x=0, opaque, hit-tested. "Agent proposed" + Confirm → click → `Ready`. Status not pasted (positional lands past it) nor exported | pass. First column, read-only, `tabulator-frozen-left`; at 520px with `scrollLeft` 263 it stays at x=1 and is hit-tested (email at x=−2). Confirm → `Ready`. Not pasted or exported |
| P18 | pass. `add_rows` normalizes ` CY@acme.com ` → `cy@acme.com`, reports `already has an account` and `Invalid email address`, `3 rows 3 changes 2 errors`. `update_rows` → 1 updated, `missingIds ['nope']`. `delete_rows` → 1 deleted, `['nope']` missing, `2 rows 2 changes`. `validate` → 0 errors | pass. Identical results. Tabulator also logs `warn: Find Error - No matching row found: nope` |
| P19 | pass. WebMCP lists 8 tools, `window.scInvite.webmcp` true. `read_pasted_table` + `propose_column_mapping` fill the panel's selects; Apply → "Added 2 pasted row(s)…". Send → "Simulated — no invitations sent (2 valid)". Download template (7,997 B), Download as Excel (8,080 B). "Import .xlsx" opens the native chooser, import → "Imported 2 row(s) from invite-users.xlsx; 0 error(s) to fix." | pass. Identical agent results and notices, template 7,997 B, workbook 8,079 B, same import |
| P20 | not rerun; ticket 11 measured it (paste 2,000 → paint ~0.1 s dev, 0 long scroll tasks in prod) | pass (usable). 2,000-row paste (+ header) → `2001 rows` in 0.5 s, 40 DOM rows. 20 wheel steps of 3,000px reach `scrollTop` 60,000. A double-click edit on row 1,676 commits. Sidebar "Row 1901: email" scrolls the cell into view with its outline |

### Differences between engines

Behaviour:
- **Select-all with some rows ticked:** TanStack ticks all rows; Tabulator unticks all.
- **Empty values when sorting ascending:** TanStack puts the blank row last; Tabulator puts it first. Descending is the reverse on both.
- **Typing to edit:** works on TanStack; Tabulator ignores typing on a selected cell (Enter or double-click only).
- **Tab while editing:** both commit and move right. Tabulator also opens the editor on the next cell; TanStack doesn't.
- **Editing a wide cell:** Tabulator scrolls the grid sideways to fit the editor (37px for Issue), which pushes the checkbox column out of view. TanStack doesn't scroll.
- **Scroll to error:** TanStack scrolls both axes, makes the cell active and focuses the grid. Tabulator scrolls rows only, so a right-hand column can stay off-screen. It doesn't move the active cell or focus.
- **Client validation display:** TanStack shows a ring with the message as a tooltip (`title`). Tabulator shows a red border with no message on the cell. Neither counts it in the errors chip.
- **Whole-row selection:** TanStack uses a press in the checkbox cell beside the box, on both pages. Tabulator uses the row header, which is `__select` on compliance and **Status** on invite. On invite, a press on Tabulator's `__select` cell selects only that one cell, and Confirm also selects the whole row.
- **Enum header filter clear:** TanStack has an always-visible trailing ×. Tabulator has a native search × that appears only on focus, or Escape.
- **Empty-state paste:** TanStack's overlay click focuses the grid. Tabulator's doesn't (bug 4).
- **Clear:** works on TanStack; unusable on Tabulator (bug 3).
- **CSV format:** TanStack writes unquoted fields with CRLF. Tabulator quotes every field and uses LF. Compliance on Tabulator also adds an empty first column (bug 5).

Look:
- Tabulator invite columns are auto-sized (Email 85px, truncated). TanStack uses fixed widths.
- Tabulator starts with A1 selected and its column header painted blue. TanStack starts with no active cell.
- Tabulator writes `warn: Find Error - No matching row found` to the console when an agent deletes an unknown id. TanStack writes nothing.

### Network (dev server, fresh tab, cache cleared and disabled)

- `/` (163 requests) and `/invite-users` (174): no `tabulator-tables` module (`.vite/deps/tabulator-tables.js`), no `tabulator_modern.min.css`, and no `GridEditor`, `useGridEditor` or `useDirtyTracking` module.
- Still loaded on TanStack routes. These are not a Tabulator code leak, but they have `tabulator` in the URL: `src/utils/zodToTabulatorColumns.ts` on both routes (type-only import of `tabulator-tables`), and `src/composables/buildComplianceColumns.ts` on `/`. Both pages import them statically for their Tabulator branch.
- `/tabulator` and `/tabulator/invite-users` load `GridEditor/index.ts`, `GridEditor.tsx`, `useGridEditor.ts`, `useDirtyTracking.ts`, `.vite/deps/tabulator-tables.js` and `tabulator_modern.min.css`.
- Before `e433a28`, `/` and `/invite-users` loaded `tabulator-tables.js` and the CSS too (measured, then fixed by Main).
- Prod build (`vp build --outDir /tmp/…`, chunk graph read, not served): Tabulator code is in `GridEditor-*.js` (469 kB, 31 `tabulator-row` strings) and its CSS in `GridEditor-*.css`. Both are reached only through the pages' dynamic import. Both pages statically import a shared 377 kB chunk named **`zodToTabulatorColumns-*.js`**. It holds zod and contracts, with 0 Tabulator strings, so a strict "no URL contains `tabulator`" check fails in prod because of the chunk name only.

### Agent tools

- Both invite routes, after a full load: WebMCP (native `document.modelContext` in this Chromium) lists 8 unique tools, and `window.scInvite` works. `add_rows` lands in the visible grid.
- Nav `/invite-users` → "Invite" (`/tabulator/invite-users`) → "Invite Users": the WebMCP count stays 8 and `window.scInvite` stays set. But the page **is not remounted**: the DOM stays TanStack, no unregister or register is logged, and an `add_rows` made "on" `/tabulator/invite-users` landed in the TanStack grid. It was still there after navigating back. This is bug 1, so per-route registration can't be judged through direct nav.
- Through another page (`/invite-users` → `/` → `/tabulator/invite-users`), the wrapper logged `reg@/invite-users ×8`, `unreg ×8` on leaving (logged at `/`), then `reg@/tabulator/invite-users ×8`. Unregister happens before register. `window.scInvite` is absent on `/` and WebMCP lists 0 tools there.

### Console

Fresh loads of all 4 routes: 0 errors, 0 warnings. During the run, only my own logpoint errors appeared (`payload is not defined`, from an off-by-two line). One `TypeError: Cannot read properties of undefined (reading 'add')` showed up once. I couldn't reproduce it in a later sweep of the Tabulator flows, and its source wasn't captured.

## Lead follow-up to the parity run

- Bug 1 (same page component on two routes kept its first engine): fixed in `08de335`. `Application` keys the routed page by path. Verified with real nav clicks: `/` → `/tabulator` shows `.tabulator`, back to `/` shows DataGrid. Regression test in `Application.test.ts`.
- Bug 2 (Tabulator Clear dialog empty): fixed in `08de335`. The body was in UModal's default (trigger) slot; it is now the `content` slot. Verified: the dialog shows "Clear all rows? … 10 rows".
- Bug 4 (Tabulator compliance CSV empty first column): fixed in `08de335` (`download: false` on the checkbox column).
- Bug 3 (Tabulator empty-state overlay doesn't focus the grid, so Cmd+V does nothing): predates this work and is on the comparison-only engine. Left as a recorded difference.
- `zodToTabulatorColumns.ts` (type-only Tabulator import) still loads on the TanStack routes, and the shared production chunk is named after it. No Tabulator runtime or CSS loads there.

## Lead: Tabulator split and agent-tool rerun

- The Tabulator column builders now load only with the Tabulator grid: `components/TabulatorGrids/{Compliance,Invite}TabulatorGrid.tsx` are the only importers of `GridEditor`, `buildComplianceColumns` and `zodToTabulatorColumns`, and the pages reach them through `defineAsyncComponent`.
- Network check (dev server, fresh tab per route, `performance` resource entries, repo path removed before matching): `/` and `/invite-users` load no module or stylesheet whose path contains `tabulator` or `GridEditor`. The only match was the page file `ComplianceGridEditor.tsx` itself. `/tabulator` and `/tabulator/invite-users` load the wrapper, `GridEditor`, `useGridEditor`, `zodToTabulatorColumns`, `tabulator-tables.js` and `tabulator_modern.min.css`.
- Production build: the TanStack page chunks don't import the Tabulator chunk. It is reached only by dynamic import. Rolldown names that chunk `zodToTabulatorColumns-*`, and `index-*.js` contains `tabulator` only as nav text and route paths.
- Agent tools, rerun after the route-key fix. Real nav clicks `/invite-users` → `/tabulator/invite-users` → `/invite-users`, with a scripted `document.modelContext` stub that records register and abort:
  - The registration log reads `8 registered, 8 aborted, 8 registered, 8 aborted, 8 registered`. Each page unregisters all 8 tools before the next page registers.
  - 8 tools are live on every route.
  - A scripted `scInvite.call('add_rows')` row appeared in the visible grid each time. The other route's row was not there.
