# sc-tabulator — Agent Guidelines

## Project

Spreadsheet-style grid prototype — compliance library admin grid and bulk
invite page on TanStack Table (Nuxt UI `UTable`). One package at the repo root:
a Vue 3.5 + TSX admin app (port 3500) on Vite+ (Vite 8), Nuxt UI v4 and
Tailwind v4. Both pages (`/` and `/invite-users`) render the `DataGrid`
component. The shared Zod schemas live in `src/contracts/`.

Requires Node >= 24 and pnpm >= 12. Use pnpm only.

## Commands

```bash
pnpm install          # install deps
pnpm dev              # dev server (port 3500)
pnpm build            # vp build → dist/
pnpm test             # vp test run (every test, one config)
pnpm lint             # vp lint (Oxlint)
pnpm fmt              # vp fmt (Oxfmt) on TypeScript files
pnpm typecheck        # tsc --noEmit
pnpm knip             # dead code detection
pnpm jscpd            # duplicate code detection
pnpm agents:check     # validate AGENTS.md documents essential commands
pnpm validate         # lint + typecheck + test + knip (full gate)
```

## Architecture

Vue 3.5 + Vite+ (Vite 8) + TSX (NOT SFCs) + Nuxt UI v4 + Tailwind v4.

- All components are `.tsx` using `defineComponent({ setup() { return (): VNode =>
<.../> } })` with render functions. No SFCs, no `<script setup>`.
- Nuxt UI v4 components imported explicitly with `U` prefix (no auto-registration).
- AutoImport configured for Vue + vue-router APIs only. VueUse (`@vueuse/core`)
  is imported explicitly; reach for a VueUse composable before custom code.
- Vite resolve aliases (mirrored in `tsconfig.json` paths): `components`,
  `composables`, `utils`, and `contracts` → `src/contracts`. Everything else
  under `src/` is imported by relative path.
- `vite.config.ts` is the only config: app, `test` (happy-dom, the
  `setup-localstorage.ts` polyfill), `lint`, `fmt` and `staged`.

### Contracts (`src/contracts/`)

Zod schemas only (no oRPC — backend was removed for the prototype), imported as
`'contracts'`. Per-resource folders hold `schemas/` behind a barrel `index.ts`;
`src/contracts/index.ts` aggregates them. The save result every `onSave`
returns is the grid's `GridSaveResponse` (`utils/gridApi.ts`), not a contract.

## Conventions

**Dependency versions** — no `catalog:` references (StackBlitz does not support
catalogs). Dependencies are pinned to explicit versions in `package.json`
(e.g. `"vue": "3.5.38"`). `pnpm-workspace.yaml` holds only pnpm settings:
`allowBuilds`, and one `overrides` entry that pins every `vite` to Vite+'s
bundled core (`npm:@voidzero-dev/vite-plus-core@…`, an explicit version) so
tests and the app share one Vite. `vp migrate` maintains it; keep it, the
`vite` devDependency and `vite-plus` in step when upgrading Vite+.

**Toolchain** — Vite+ (`vite-plus`, the `vp` CLI) supplies Vite, Vitest
(`vite-plus/test` imports), Oxlint and Oxfmt.

**Guardrails** — vp lint (Oxlint), vp fmt (Oxfmt), vp test (Vitest), tsc
(typecheck), knip (dead code), jscpd (duplicate code). Run `pnpm validate`
before committing.

**Lint preset** — `vite.config.ts` extends `@cloudflare/oxlint-config` (Vite+
entry, type-aware). Rules the code broke at adoption are `'off'` in a commented
baseline block: enable one per commit (fix its findings or record why it stays
off), following `node_modules/@cloudflare/oxlint-config/skills/migrate-oxlint-config/SKILL.md`.
React-only rules stay off because the app is Vue TSX.

**Pre-commit hooks** — `.vite-hooks/pre-commit` runs `vp staged`, which lints
and format-checks staged TS files (the `staged` block in `vite.config.ts`).
AGENTS.md is validated for documented commands on every commit via
`pnpm agents:check`. `pnpm install` runs `vp config`, which installs the hook
dispatcher.

**Naming conventions** — use camelCase for functions and variables, PascalCase
for components and types, kebab-case for file names of non-component modules.
Oxlint `unicorn/filename-case` rule enforces file naming. Cyclomatic complexity
is capped at 15 via the Oxlint `complexity` rule.

**Module boundaries** — `import/no-cycle` prevents circular dependencies.
`src/contracts/` must not import from the app; a `no-restricted-imports` lint
override enforces it.

**Grid** — both pages render `DataGrid` (`components/DataGrid/`) with
`GridColumn`s and expose the `GridApi` in `utils/gridApi.ts`.

| Route | Page |
|---|---|
| `/` | `ComplianceGridEditor`, compliance |
| `/invite-users` | `BulkInviteUsers`, bulk invite |

**DataGrid rules** — `rows` (a `shallowRef` in `useDataGrid`) is the single
source of truth and is replaced immutably, never mutated. Grid logic is pure
modules over `GridColumn[]` + `Row[]` keyed by row id + column id (`utils/grid*.ts`,
`csv.ts`, `zodToColumnDefs.ts`). Cells read per-cell state inside `GridCell`'s
own `computed`, never in the column `cell` function. Rows have a fixed
`ROW_HEIGHT` that `virtualize` and scroll-to-row rely on. Spec and measured
`UTable` gotchas: `.scratch/tanstack-grid/`.

## Key Files

| File                                                      | Purpose                                               |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `src/pages/ComplianceGridEditor.tsx`                      | Compliance grid page                                  |
| `src/utils/complianceLibrary.ts` | Compliance library: grid columns and the fake backend (`list`, `save` = `onSave`), tested through `save` |
| `src/components/DataGrid/DataGrid.tsx` | Grid component: `UTable`, toolbar, DOM wiring (keys, pointer, clipboard, scroll), error sidebar |
| `src/composables/useDataGrid.ts` | DataGrid state: rows, every person write (edit, paste, fill, clear, `api.importRows`), undo/redo (`useManualRefHistory`), derived dirty diff, save loop, `GridApi` |
| `src/composables/useGridSelection.ts` | Active cell, range, editing cell and the press gesture (press, enter, release; editing blocks a drag) — ids, not indexes |
| `src/composables/useGridInteraction.ts` | What a key or an edit end means: selection change + write, returned as a `GridEffect` (preventDefault, reveal, focus) for `DataGrid` to apply; tested without mounting |
| `src/utils/zodToColumnDefs.ts` | Derive `GridColumn`s from a Zod schema |
| `src/utils/gridApi.ts` | The grid's seams: `Row` and `GridColumn` (pure grid modules import them from here, never from `useDataGrid`), the save result, and the `GridApi` implemented by `useDataGrid`'s `api`; draft and agent-tool tests run on it headless in an `effectScope` |
| `src/utils/gridClipboard.ts` | Clipboard TSV codec: `serializeTsv` and `parseTsv`, the one reader for every paste path |
| `src/pages/BulkInviteUsers.tsx` | SC15-706 bulk invite prototype — Excel template/import, paste, simulated send |
| `src/utils/inviteDraft.ts` | Invite draft module — every rule on who may change which rows (agent proposed, confirm, refused deletes, unmapped tables, Send gate) |
| `src/utils/inviteAgentTools.ts` | Agent tools: adapter over the invite draft module (edit-only; no send/confirm/apply tool) |
| `src/utils/draftRow.ts` | One draft row: cleanup + line parser (never guesses), needs-review detection |
| `src/utils/readyRows.ts` | Ready-row check: Send errors and each row's status (needs review › agent proposed › not ready › ready) |
| `src/utils/columnMapping.ts` | Client tables (pasted or imported): `planTable` header/alias matching, hold vs insert, column mapping |
| `src/components/ColumnMappingPanel/ColumnMappingPanel.tsx` | Mapping panel for an unmapped table (person applies; agent may propose) |
| `CONTEXT.md` / `docs/adr/` | Domain glossary (bulk invite terms) and ADRs |
| `src/composables/useAgentTools.ts` | Registers tools on `document.modelContext` (WebMCP) + `window.scInvite` bridge |
| `src/composables/useInviteDraftStorage.ts` | Invite draft in localStorage (`/invite-users` only): rows + agent-proposed ids, saved on every draft check, restored on load |
| `src/utils/test-infra.test.ts`                           | Test infrastructure tests (localStorage polyfill, component mounting) |
| `setup-localstorage.ts`                                  | In-memory localStorage polyfill wired via vitest setupFiles |
| `src/contracts/compliance-library/schemas/index.ts`       | Zod schema for compliance library entity              |
| `.wayfinder/map.md`                                       | Wayfinder decision map                                |
| `knip.json`                                               | Dead code detection config                            |
| `.jscpd.json`                                             | Duplicate code detection config                       |

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature>/` (spec.md + issues/NN-slug.md). Earlier
prototype tickets stay in `.wayfinder/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five roles (needs-triage, needs-info, ready-for-agent, ready-for-human,
wontfix), recorded as a `Status:` line. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
