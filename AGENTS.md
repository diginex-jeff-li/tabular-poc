# sc-tabulator — Agent Guidelines

## Project

Spreadsheet-style grid prototype — compliance library admin grid and bulk
invite page on TanStack Table (Nuxt UI `UTable`), with the Tabulator build
kept for comparison. A pnpm workspace monorepo with two packages:

- **`contracts/`** — Shared Zod schemas (oRPC removed, Zod only). SWC-compiled
  ESM + tsc declaration files. Consumed by frontend.
- **`frontend/`** — Vue 3.5 + TSX admin app (port 3500). Vite+ (Vite 8),
  Nuxt UI v4, Tailwind v4. Grid engine `DataGrid` at `/` and `/invite-users`;
  Tabulator `GridEditor` at `/tabulator` and `/tabulator/invite-users`.

Requires Node >= 24 and pnpm >= 12. Use pnpm only.

## Commands

```bash
pnpm install          # install all deps
pnpm dev              # run frontend dev server (port 3500)
pnpm build            # build contracts → frontend
pnpm test             # run all tests (contracts + frontend)
pnpm lint             # vp lint (Oxlint) across all packages + root
pnpm fmt              # vp fmt (Oxfmt) across all packages
pnpm typecheck        # tsc --noEmit (contracts build first)
pnpm knip             # dead code detection
pnpm jscpd            # duplicate code detection
pnpm agents:check     # validate AGENTS.md documents essential commands
pnpm validate         # lint + typecheck + test + knip (full gate)
```

### contracts

```bash
pnpm --filter contracts build        # SWC ESM + tsc declarations → dist
pnpm --filter contracts test          # vp test run (Zod schema tests)
pnpm --filter contracts lint          # vp lint src
pnpm --filter contracts fmt           # vp fmt --write "src/**/*.ts"
```

### frontend

```bash
pnpm --filter @sc/admin dev           # vp dev (port 3500)
pnpm --filter @sc/admin build         # vp build
pnpm --filter @sc/admin typecheck     # tsc --noEmit
pnpm --filter @sc/admin test          # vp test run (component tests)
```

Always rebuild contracts after changing them before running frontend:
`pnpm --filter contracts build` (both import from `dist/`).

## Architecture

### Contracts (`contracts/`)

Zod schemas only (no oRPC — backend was removed for the prototype). Per-resource
folders under `src/`: `schemas/`, `requests/`, `responses/`. Each exports a barrel
`index.ts`. The root `src/index.ts` aggregates all resources.

- Build: SWC compiles `src` → `dist/esm`, `tsc` emits `dist/types`.
- Consumed by frontend via `contracts` workspace dependency.

### Frontend (`frontend/apps/admin/`)

Vue 3.5 + Vite+ (Vite 8) + TSX (NOT SFCs) + Nuxt UI v4 + Tailwind v4.

- All components are `.tsx` using `defineComponent({ setup() { return (): VNode =>
<.../> } })` with render functions. No SFCs, no `<script setup>`.
- Nuxt UI v4 components imported explicitly with `U` prefix (no auto-registration).
- AutoImport configured for Vue + vue-router APIs only. VueUse (`@vueuse/core`)
  is imported explicitly; reach for a VueUse composable before custom code.
- Vite resolve aliases: `src`, `components`, `composables`, `config`, `pages`,
  `styles`, `utils`.

### Test config (dual vitest)

There are two frontend vitest configs and root `pnpm test` only loads one:

- `frontend/apps/admin/vite.config.ts` (`test` block) — loaded by
  `pnpm --filter @sc/admin test`, which is what root `pnpm test` runs. **This is
  the config that takes effect.**
- `frontend/vitest.config.ts` — loaded by `pnpm --filter frontend test` (the
  parent workspace package, not run by root `pnpm test`).

Both currently carry the same `setupFiles` (the `frontend/setup-localstorage.ts`
localStorage polyfill). If you change test configuration, change **both** configs
or you will produce a config change that silently never applies.

## Monorepo Conventions

**Dependency versions** — no `catalog:` references anywhere (StackBlitz does not
support catalogs). External dependencies are pinned to explicit versions in each
`package.json` (e.g. `"vue": "3.5.38"`). The only `workspace:` reference is the
internal `contracts` package, declared as `"contracts": "workspace:*"` in
`frontend/apps/admin/package.json`. `pnpm-workspace.yaml` holds workspace globs,
`allowBuilds`, and one `overrides` entry that pins every `vite` to Vite+'s
bundled core (`npm:@voidzero-dev/vite-plus-core@…`, an explicit version, not a
catalog) so tests and the app share one Vite. `vp migrate` maintains it; keep it,
the `vite` devDependencies and `vite-plus` in step when upgrading Vite+.

**Toolchain** — Vite+ (`vite-plus`, the `vp` CLI) supplies Vite, Vitest
(`vite-plus/test` imports), Oxlint and Oxfmt. Lint, format and staged-file
config live in the root `vite.config.ts`.

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
Contracts must not import from frontend. Frontend imports contracts via the
`contracts` workspace dependency only.

**Grid engines** — one page per area, with an `engine: 'tanstack' | 'tabulator'`
prop set by the route. Both engines take the props in
`components/gridEngineProps.ts` and expose the `GridApi` in `utils/gridApi.ts`.

| Route | Engine |
|---|---|
| `/` | TanStack (`DataGrid`), compliance |
| `/invite-users` | TanStack (`DataGrid`), bulk invite |
| `/tabulator` | Tabulator (`GridEditor`), compliance |
| `/tabulator/invite-users` | Tabulator (`GridEditor`), bulk invite |

New grid work goes to `DataGrid` only. The Tabulator side (`GridEditor`,
`useGridEditor`, `useDirtyTracking`, `zodToTabulatorColumns`,
`buildComplianceColumns`, `tabulator-tables`) is **comparison-only**: keep it
working, don't extend it. Tabulator is MIT licensed with no paid tier.

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
| `frontend/apps/admin/src/pages/ComplianceGridEditor.tsx`  | Compliance grid page (either engine)                  |
| `frontend/apps/admin/src/components/DataGrid/DataGrid.tsx` | TanStack grid engine: `UTable`, toolbar, keyboard, clipboard, error sidebar |
| `frontend/apps/admin/src/composables/useDataGrid.ts` | DataGrid state: rows, derived dirty diff, save loop, `GridApi` |
| `frontend/apps/admin/src/composables/useGridSelection.ts` | Active cell, range and editing state (ids, not indexes) |
| `frontend/apps/admin/src/utils/zodToColumnDefs.ts` | Derive engine-neutral `GridColumn`s from a Zod schema |
| `frontend/apps/admin/src/utils/gridApi.ts` | `GridApi` seam shared by both engines and `memoryGridApi` |
| `frontend/apps/admin/src/utils/zodToTabulatorColumns.ts`  | Tabulator (comparison-only): column defs from Zod schema |
| `frontend/apps/admin/src/composables/useDirtyTracking.ts` | Tabulator (comparison-only): dirty tracking |
| `frontend/apps/admin/src/composables/useGridEditor.ts`   | Tabulator (comparison-only): lifecycle, paste, save, errors |
| `frontend/apps/admin/src/components/GridEditor/GridEditor.tsx` | Tabulator (comparison-only): grid editor component |
| `frontend/apps/admin/src/pages/BulkInviteUsers.tsx` | SC15-706 bulk invite prototype — Excel template/import, paste, simulated send |
| `frontend/apps/admin/src/utils/inviteDraft.ts` | Invite draft module — every rule on who may change which rows (agent proposed, confirm, refused deletes, unmapped tables, Send gate) |
| `frontend/apps/admin/src/utils/inviteAgentTools.ts` | Agent tools: adapter over the invite draft module (edit-only; no send/confirm/apply tool) |
| `frontend/apps/admin/src/utils/draftRow.ts` | One draft row: cleanup + line parser (never guesses), row status |
| `frontend/apps/admin/src/utils/memoryGridApi.ts` | In-memory `GridApi` adapter for tests (the two grid engines are the others) |
| `frontend/apps/admin/src/utils/columnMapping.ts` | Pasted client tables: header/alias matching, hold vs insert, column mapping |
| `frontend/apps/admin/src/components/ColumnMappingPanel/ColumnMappingPanel.tsx` | Mapping panel for an unmapped table (person applies; agent may propose) |
| `CONTEXT.md` / `docs/adr/` | Domain glossary (bulk invite terms) and ADRs |
| `frontend/apps/admin/src/composables/useAgentTools.ts` | Registers tools on `document.modelContext` (WebMCP) + `window.scInvite` bridge |
| `frontend/apps/admin/src/utils/test-infra.test.ts`       | Test infrastructure tests (localStorage polyfill, component mounting) |
| `frontend/setup-localstorage.ts`                         | In-memory localStorage polyfill wired via vitest setupFiles |
| `contracts/src/compliance-library/schemas/index.ts`       | Zod schema for compliance library entity              |
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
