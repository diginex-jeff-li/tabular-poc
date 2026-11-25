# sc-tabulator

Tabulator grid editor prototype with three areas:

- **Compliance Library** (`/`) — admin grid for compliance reference data.
- **Custom Tables** (`/custom`) — user-defined table structures (column name,
  type, validation) persisted to localStorage, editable via the same grid
  engine.
- **Invite Users** (`/invite-users`) — SC15-706 bulk invite prototype: Excel
  template with built-in validation, import, paste, and AI agent tools via
  WebMCP.

A pnpm workspace monorepo with two packages:

- **`contracts/`** — Shared Zod schemas (oRPC removed, Zod only). SWC-compiled
  ESM + tsc declaration files. Consumed by frontend.
- **`frontend/`** — Vue 3.5 + TSX admin app (port 3500). Vite+ (Vite 8),
  Nuxt UI v4, Tailwind v4.

## Prerequisites

- Node >= 24
- pnpm >= 12

## Quick Start

```bash
pnpm install          # install all deps
pnpm dev              # run frontend dev server (port 3500)
```

Open <http://localhost:3500> for the compliance library grid, or
<http://localhost:3500/custom> to manage custom tables, or
<http://localhost:3500/invite-users> for the bulk invite prototype.

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
- AutoImport configured for Vue + vue-router APIs only.
- Vite resolve aliases: `src`, `components`, `composables`, `config`, `pages`,
  `styles`, `utils`.

#### Custom Tables

Users define their own table structures and fill them with the same grid editor
used by the compliance library. Tables persist to localStorage.

- **Routes**: `/custom` (list), `/custom/new` (builder), `/custom/:tableId` (editor).
- **Domain types**: `types/customTable.ts` — Zod schemas for `ColumnDef`,
  `TableDefinition`, and `TableRow`.
- **Runtime schema**: `utils/buildRuntimeSchema.ts` compiles `ColumnDef[]` into
  a Zod object schema for validation at edit time.
- **Column mapping**: `utils/definitionToColumns.ts` converts `ColumnDef[]` to
  Tabulator column definitions.
- **Persistence**: `utils/tableStorage.ts` — localStorage layer with corruption
  tolerance. Wrapped by `composables/useTableDefinitions.ts` (VueUse
  `useLocalStorage`).
- **Shared grid engine**: `composables/useGridEditor.ts` (editing, paste, save,
  dirty tracking, error sidebar, validation, sort/filter, export, clear) +
  `components/GridEditor/GridEditor.tsx` (toolbar, status area, error sidebar).
  Both compliance library and custom table editors use this engine.

#### Bulk Invite + WebMCP (`/invite-users`)

Prototype for SC15-706 Scenario A. Columns are assumed (the ticket defines no
template): `contracts/src/user-invite` mirrors sc-shared-contracts
`InviteManagedProfileRequestSchema`, with role and groups as names; groups are
one `"; "`-separated cell (`Apparel; Electronics`). Vocabulary: `CONTEXT.md`;
design decisions: `.scratch/invite-draft-rows/spec.md` and
`docs/adr/0001-draft-rows-vs-ready-rows.md`.

- **Invite template** (`contracts/src/user-invite`): `InviteRowSchema` is the
  one source for columns, titles, required fields, lengths and header aliases;
  the draft row schema is derived from it.
- **Invite draft module** (`utils/inviteDraft.ts`): every rule on who may change
  which rows. Every way in (paste, Excel import, cell edits, agent writes) is
  cleaned up; a whole line stuck in one cell is split only when no guess is
  needed. Rows show a status: Ready, Not ready, Needs review, Agent proposed.
  An agent-resolved row blocks Send until a person confirms or edits it.
- **Pasted client tables** (`utils/columnMapping.ts`): pastes are matched to the
  template by header name or alias (Surname, Given name, E-mail…); unmatched
  tables are held in a mapping panel. The agent may propose a mapping; only a
  person applies it. An "Auto-match headers" switch holds every paste (agent demo).
- **Excel**: `utils/inviteWorkbook.ts` generates `.xlsx` with data validation
  (first-pass only; typed entries) and imports by header name or alias. Import
  re-checks every row with the real rules.
- **Send invites is simulated** — nothing is sent. Bulk atomicity, oversight
  approval and partial failure are undefined by the ticket.
- **Agent tools** (`utils/inviteAgentTools.ts`, an adapter over the invite draft
  module): `get_invite_form`, `read_rows`, `add_rows`, `update_rows`,
  `delete_rows`, `validate`, `read_pasted_table`, `propose_column_mapping`. They
  accept draft rows (any text); validity is `validate`'s job. No tool sends,
  confirms a row or applies a mapping. JSON Schemas come from Zod
  (`z.toJSONSchema`). `composables/useAgentTools.ts` registers them on
  `document.modelContext` (WebMCP) and on `window.scInvite` (plain JS bridge,
  NOT WebMCP).

Trying it with an agent (observed):

| Agent | Setup | Result |
| ----- | ----- | ------ |
| ChatGPT desktop, Codex mode | Built-in browser; ask it to use this tab's site tools, not the Chrome DevTools integration | Native WebMCP calls |
| ChatGPT desktop, chat mode / ChatGPT Chrome extension | Page open | Sees the page, does not call the tools |
| Chrome + flag | `chrome://flags/#enable-webmcp-testing`; banner turns green; `await document.modelContext.getTools()` | Tools registered and callable via `executeTool` |
| Scripting agents (Claude for Chrome, omp) | "This page exposes WebMCP tools / `window.scInvite`; use them" | Calls through page JS — not native WebMCP |

## Routes

| Path              | Page                   | Description                                |
| ----------------- | ---------------------- | ------------------------------------------ |
| `/`               | ComplianceGridEditor   | Compliance library reference data grid     |
| `/custom`         | CustomTableList        | List all user-defined custom tables        |
| `/custom/new`     | CustomTableBuilder     | Define a new table (columns, types, rules) |
| `/custom/:tableId` | CustomTableEditor     | Edit rows of a custom table in the grid    |
| `/invite-users`   | BulkInviteUsers        | SC15-706 bulk invite + WebMCP prototype    |

## Monorepo Conventions

**Dependency versions** — external deps use explicit pinned versions (e.g.
`"vue": "3.5.38"`). The internal `contracts` package uses `workspace:*`.

**Toolchain** — Vite+ (`vite-plus`, the `vp` CLI) supplies Vite, Vitest, Oxlint
and Oxfmt; lint, format and staged-file config live in the root
`vite.config.ts`. Lint extends `@cloudflare/oxlint-config`.

**Guardrails** — vp lint, vp fmt, vp test, tsc (typecheck), knip (dead code),
jscpd (duplicate code). Run `pnpm validate` before committing.

**Pre-commit hooks** — `.vite-hooks/pre-commit` runs `vp staged` (lint and
format check on staged files). AGENTS.md is validated for documented commands
on every commit.

**Naming conventions** — use camelCase for functions and variables, PascalCase for
components and types, kebab-case for file names of non-component modules. Oxlint
`unicorn/filename-case` and `complexity` rules are enabled.

**Module boundaries** — `import/no-cycle` prevents circular dependencies. Contracts
must not import from frontend. Frontend imports contracts via the `contracts`
workspace dependency only.

**Tabulator** — MIT licensed, all features free. No paid tier. The prototype
proves: clipboard paste, validation, filtering, sorting, CSV export, checkbox
selection — all in the free core.

## Key Files

| File                                                      | Purpose                                               |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `frontend/apps/admin/src/pages/ComplianceGridEditor.tsx`  | Compliance library grid editor page                   |
| `frontend/apps/admin/src/pages/CustomTableList.tsx`       | Custom tables list page (`/custom`)                   |
| `frontend/apps/admin/src/pages/CustomTableBuilder.tsx`    | New custom table builder page (`/custom/new`)         |
| `frontend/apps/admin/src/pages/CustomTableEditor.tsx`     | Custom table grid editor page (`/custom/:tableId`)    |
| `frontend/apps/admin/src/composables/useGridEditor.ts`   | Shared grid engine — editing, paste, save, dirty tracking, validation, sort/filter, export |
| `frontend/apps/admin/src/components/GridEditor/GridEditor.tsx` | Grid presentation component — toolbar, status area, error sidebar |
| `frontend/apps/admin/src/composables/useDirtyTracking.ts` | Track added/modified/deleted rows for diff-based save |
| `frontend/apps/admin/src/composables/useTableDefinitions.ts` | VueUse `useLocalStorage` wrapper for table definitions |
| `frontend/apps/admin/src/types/customTable.ts`            | Zod schemas for ColumnDef, TableDefinition, TableRow |
| `frontend/apps/admin/src/utils/zodToTabulatorColumns.ts`  | Derive Tabulator column defs from Zod schema          |
| `frontend/apps/admin/src/utils/buildRuntimeSchema.ts`     | Compile ColumnDef[] → Zod object schema for validation |
| `frontend/apps/admin/src/utils/definitionToColumns.ts`    | Convert ColumnDef[] → Tabulator column definitions    |
| `frontend/apps/admin/src/utils/tableStorage.ts`           | localStorage persistence layer with corruption tolerance |
| `frontend/apps/admin/src/utils/columnValidation.ts`       | Shared validation helpers for builder + add-column modal |
| `frontend/apps/admin/src/pages/BulkInviteUsers.tsx`       | Bulk invite page (`/invite-users`) — Excel, paste, agent tools |
| `frontend/apps/admin/src/utils/validateInvites.ts`        | Send checks for the invite draft (also behind the agent `validate` tool) |
| `frontend/apps/admin/src/utils/inviteDraft.ts`            | Invite draft module — who may change which rows, statuses, unmapped tables, Send gate |
| `frontend/apps/admin/src/utils/draftRow.ts`               | One draft row: cleanup, line parser, status |
| `frontend/apps/admin/src/utils/columnMapping.ts`          | Pasted client tables: header/alias matching, hold vs insert |
| `frontend/apps/admin/src/utils/inviteWorkbook.ts`         | Excel template (with data validation) + `.xlsx` import |
| `frontend/apps/admin/src/utils/inviteAgentTools.ts`       | Agent tools — adapter over the invite draft module (no send/confirm/apply tool) |
| `frontend/apps/admin/src/composables/useAgentTools.ts`    | Register tools on WebMCP + `window` bridge            |
| `contracts/src/user-invite/schemas/index.ts`              | Invite template: row schema, columns, aliases, role/group lists |
| `contracts/src/compliance-library/schemas/index.ts`       | Zod schema for compliance library entity              |
| `.wayfinder/map.md`                                       | Wayfinder decision map                                |
| `knip.json`                                               | Dead code detection config                            |
| `.jscpd.json`                                             | Duplicate code detection config                       |
