# Wayfinder Map: Admin Grid Editor

> **Label:** `wayfinder:map`
> **Status:** Charted — 2026-08-09
> **Repo:** `sc-boilerplate` (prototype host)

## Destination

A full spec for a reusable admin-grid pattern: replace the download-Excel / populate / upload flow with an in-browser grid editor (Tabulator) where admins paste from Excel, validate with Zod, and save via diff-based upsert. The compliance library (`Sample library.xlsx`, 8 columns × ~100 rows) is the first instance. A prototype in `sc-boilerplate` validates the spec before it's carried back to `sc1.5`.

## Notes

**Stack** — `sc-boilerplate`: Vue 3.5 + TSX (no SFCs, no `<script setup>`), Vite 8, NestJS 11, oRPC/Zod contracts (`bp-contracts`), TypeORM 0.3.30, Nuxt UI v4, Tailwind v4, oxlint/oxfmt/vitest.

**Library** — Tabulator (MIT, all features free). Clipboard paste, validation framework (`highlight` mode, `getInvalidCells()`), range selection all in core. No paid tier. Vue 3 integration: plain JS + `div` ref in `onMounted`, no wrapper. Fallback if paste UX fails: RevoGrid Community (free clipboard, DIY validation) → AG Grid Enterprise (paid, everything).

**Skills every session should consult:** `/sc15-frontend`, `/prototype`, `/vue`, `/tdd`, `/code-review`.

**Key decisions (from grilling rounds 1–4):**

| # | Decision | Resolution |
|---|---|---|
| Q1 | Destination shape | Full spec (B) — library choice + backend contract + validation + save model |
| Q2 | Scope | Reusable pattern (B) — not just this library; future admin tables reuse it |
| Q3 | Excel role | Authoring tool only — admin populates Excel, copies body, pastes into FE grid. No separate import endpoint |
| Q4 | Validation source | Shared Zod contract (B) — single source for grid column config + backend POST |
| Q5–Q8 | Library | Tabulator first (c) — all features free, cleanest TSX fit. Handsontable eliminated (no free commercial license). RevoGrid Community gates validation behind Pro. AG Grid Community gates clipboard behind Enterprise. |
| Q9 | Save model | Diff-based upsert (B) — grid tracks dirty/added/deleted, sends `{ upserts, deletes }`. Preserves referential integrity (rows have stable IDs) |
| Q10 | Prototype scope | FE + mock backend (A) — Tabulator TSX page, paste + Zod validation, Save POSTs to mock NestJS controller with in-memory store. No real DB |
| Q11 | Library lock | Tabulator (A) — locked as prototype library |

## Decisions so far

- [Entity/key model](01-entity-key-model.md) — UUID PK, no uniqueness constraint, all 8 columns editable, `closureTiming` and `topic` as `z.enum` (closed sets), full Zod shape locked
- [Tabulator TSX spike](02-tabulator-tsx-spike.md) — Tabulator 6.5.2 renders in TSX via div-ref pattern. Paste-from-Excel, list editor, validation highlight + getInvalidCells all proven. Key finding: highlight mode validates on keyboard edit only; save loop must call validate() manually after paste.
- [Zod compliance schema](03-zod-compliance-schema.md) — 22 TDD tests, ComplianceLibrarySchema with 5 enums, BulkSaveRequest/Response schemas, routes wired. Review fixes: catalog deps, pagination wrapper on list response.
- [Mock backend bulk-save](04-mock-backend-bulk-save.md) — NestJS in-memory store, oRPC controller, 8 e2e tests. Atomic save with Zod validation. Contract-level validation rejects with 400 before service layer.
- [Column derivation from Zod](05-column-derivation.md) — zodToTabulatorColumns() utility, 6 tests. Maps Zod types to Tabulator column defs (enum→list editor, string→input, uuid/datetime→hidden).
- [Validation error display loop](06-error-display-loop.md) — ComplianceGridEditor.tsx integrates all tickets: Zod-derived columns, dirty tracking, paste, mock bulk save, per-cell error highlighting + error sidebar with click-to-scroll. Route /compliance-editor.
- [Dirty tracking for diff-based upsert](07-dirty-tracking.md) — useDirtyTracking() composable, 12 tests. Tracks added/modified/deleted via Tabulator events, buildSavePayload() returns {upserts, deletes}, clearDirty() on save.

## Not yet specified

- **Excel template generation**: Does the download-template step still exist in the new flow? Jeff's Q3 answer implies the admin still uses Excel with its own validations before pasting. If so, how are the Excel data-validation rules derived from the same Zod schema? (Could use `exceljs` to generate `.xlsx` with dropdown validations from the Zod enums.) Graduates when the save-loop prototype is proven and we revisit the full flow.
- **Excel export fallback**: Needed for audit/offline review? Jeff rejected import (C), but export may still be wanted by compliance (Jill). Graduates when the prototype is reviewed with stakeholders.
- **Concurrent editing**: What happens if two admins edit the library simultaneously? Diff-based upsert assumes single-editor. Is a lock or optimistic-concurrency check needed? Graduates when the multi-user model is discussed.
- **Performance at scale**: 100 rows now. What if the library grows to 1000+? Tabulator's virtual DOM handles rendering, but validating 1000 rows on save? Graduates when the real data volume is known.
- **Tabulator theming**: Match Nuxt UI / Tailwind v4 design tokens? Tabulator ships its own CSS. Graduates when the prototype's visual fidelity is reviewed.
- **Audit trail**: Who edited what, when? Reference data changes may need an audit log for compliance. Graduates when the compliance team (Jill) weighs in.

## Out of scope

- **Real DB persistence** — prototype uses mock backend (in-memory store). The boilerplate's `item` domain already proves the TypeORM + migration pattern.
- **Authentication/authorization** — boilerplate has it; prototype doesn't need to re-prove it.
- **Production deployment** — prototype is local-only.
- **Other admin tables** — this is the first instance of the pattern. Reuse comes after the spec is proven.

## Open tickets (frontier)

- [Add Row button](08-add-row-button.md) — "Add Row" button in toolbar, inserts blank row with UUID, marked as dirty
- [Checkbox column](09-checkbox-column.md) — dedicated checkbox column for row selection, replaces click-to-highlight
- [View saved rows](10-view-saved-rows.md) — load saved rows from backend on page open (in-memory or real NestJS)
- [Remove spike + cleanup](11-remove-spike-cleanup.md) — delete ComplianceGridSpike.tsx, remove /compliance-spike route, remove debug exposure