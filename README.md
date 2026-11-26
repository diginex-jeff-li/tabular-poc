# sc-tabulator

Spreadsheet-style grid prototype on TanStack Table (Nuxt UI `UTable`). Two
areas:

- **Compliance Library** (`/`) — admin grid for compliance reference data.
- **Invite Users** (`/invite-users`) — SC15-706 bulk invite prototype: Excel
  template with built-in validation, import, paste, and AI agent tools via
  WebMCP.

One package at the repo root: a Vue 3.5 + TSX admin app (port 3500) on Vite+
(Vite 8), Nuxt UI v4 and Tailwind v4. The shared Zod schemas live in
`src/contracts/`.

## Prerequisites

- Node >= 24
- pnpm >= 12

## Quick Start

```bash
pnpm install          # install deps
pnpm dev              # dev server (port 3500)
```

Open <http://localhost:3500> for the compliance library grid, or
<http://localhost:3500/invite-users> for the bulk invite prototype.

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
- AutoImport configured for Vue + vue-router APIs only.
- Vite resolve aliases (mirrored in `tsconfig.json` paths): `src`, `components`,
  `composables`, `config`, `pages`, `styles`, `utils`, and `contracts` →
  `src/contracts`.
- `vite.config.ts` is the only config: app, `test` (happy-dom, the
  `setup-localstorage.ts` polyfill), `lint`, `fmt` and `staged`.

### Contracts (`src/contracts/`)

Zod schemas only (no oRPC — backend was removed for the prototype), imported as
`'contracts'`. Per-resource folders hold `schemas/` behind a barrel `index.ts`;
`src/contracts/index.ts` aggregates them. The save result every `onSave`
returns is the grid's `GridSaveResponse` (`utils/gridApi.ts`), not a contract.

### Bulk Invite + WebMCP (`/invite-users`)

Prototype for SC15-706 Scenario A. Columns are assumed (the ticket defines no
template): `src/contracts/user-invite` mirrors sc-shared-contracts
`InviteManagedProfileRequestSchema`, with role and groups as names; groups are
one `"; "`-separated cell (`Apparel; Electronics`). Vocabulary: `CONTEXT.md`;
design decisions: `.scratch/invite-draft-rows/spec.md` and
`docs/adr/0001-draft-rows-vs-ready-rows.md`.

- **Invite template** (`src/contracts/user-invite`): `InviteRowSchema` is the
  one source for columns, titles, required fields, lengths and header aliases;
  the draft row schema is derived from it.
- **Invite draft module** (`utils/inviteDraft.ts`): every rule on who may change
  which rows. Every way in (paste, Excel import, cell edits, agent writes) is
  cleaned up; a whole line stuck in one cell is split only when no guess is
  needed. Rows show a status: Ready, Not ready, Needs review, Agent proposed.
  An agent-resolved row blocks Send until a person confirms or edits it.
- **Client tables** (`utils/columnMapping.ts`): a pasted table or an imported
  `.xlsx` goes through one plan. It is matched to the template by header name or
  alias (Surname, Given name, E-mail…); a table with a missing or doubled
  template column is held in a mapping panel. The agent may propose a mapping;
  only a person applies it. The "Auto-match headers" switch off holds every
  paste and import (agent demo).
- **Excel**: `utils/inviteWorkbook.ts` generates `.xlsx` with data validation
  (first-pass only; typed entries) and reads the first sheet as a plain table.
  Import re-checks every row with the real rules.
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

| Path            | Page                 | Description                             |
| --------------- | -------------------- | --------------------------------------- |
| `/`             | ComplianceGridEditor | Compliance library reference data grid  |
| `/invite-users` | BulkInviteUsers      | SC15-706 bulk invite + WebMCP prototype |

## Conventions

**Dependency versions** — dependencies use explicit pinned versions in
`package.json` (e.g. `"vue": "3.5.38"`), with no `catalog:` references.
`pnpm-workspace.yaml` holds only pnpm settings.

**Toolchain** — Vite+ (`vite-plus`, the `vp` CLI) supplies Vite, Vitest, Oxlint
and Oxfmt; app, test, lint, format and staged-file config live in
`vite.config.ts`. Lint extends `@cloudflare/oxlint-config`.

**Guardrails** — vp lint, vp fmt, vp test, tsc (typecheck), knip (dead code),
jscpd (duplicate code). Run `pnpm validate` before committing.

**Pre-commit hooks** — `.vite-hooks/pre-commit` runs `vp staged` (lint and
format check on staged files). AGENTS.md is validated for documented commands
on every commit.

**Naming conventions** — use camelCase for functions and variables, PascalCase for
components and types, kebab-case for file names of non-component modules. Oxlint
`unicorn/filename-case` and `complexity` rules are enabled.

**Module boundaries** — `import/no-cycle` prevents circular dependencies.
`src/contracts/` must not import from the app; a `no-restricted-imports` lint
override enforces it.

**Grid** — both pages render `DataGrid` (Nuxt UI `UTable`, TanStack Table).
Programmatic access (agent tools, file import) goes through the `GridApi` seam
(`utils/gridApi.ts`).

## Key Files

| File                                                      | Purpose                                               |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `src/pages/ComplianceGridEditor.tsx`                      | Compliance library grid page                          |
| `src/utils/complianceLibrary.ts`                          | Compliance library — grid columns and the fake backend (`list`, `save` = `onSave`) |
| `src/components/DataGrid/DataGrid.tsx` | Grid component — toolbar, keyboard, clipboard, error sidebar |
| `src/composables/useDataGrid.ts`                          | DataGrid state — rows, every person write (edit, paste, fill, clear), undo/redo, derived dirty diff, save loop, `GridApi` |
| `src/utils/zodToColumnDefs.ts`                            | Derive grid columns from a Zod schema                 |
| `src/pages/BulkInviteUsers.tsx`                           | Bulk invite page (`/invite-users`) — Excel, paste, agent tools |
| `src/utils/readyRows.ts`                                  | Ready-row check: Send errors and each row's status (also behind the agent `validate` tool) |
| `src/utils/inviteDraft.ts`                                | Invite draft module — who may change which rows, statuses, unmapped tables, Send gate |
| `src/utils/draftRow.ts`                                   | One draft row: cleanup, line parser, needs-review detection |
| `src/utils/columnMapping.ts`                              | Client tables (pasted or imported): header/alias matching, hold vs insert |
| `src/utils/inviteWorkbook.ts`                             | Excel template (with data validation) + `.xlsx` read as a plain table |
| `src/utils/inviteAgentTools.ts`                           | Agent tools — adapter over the invite draft module (no send/confirm/apply tool) |
| `src/composables/useAgentTools.ts`                        | Register tools on WebMCP + `window` bridge            |
| `src/composables/useInviteDraftStorage.ts` | Keeps the `/invite-users` draft in localStorage across reloads |
| `src/contracts/user-invite/schemas/index.ts`              | Invite template: row schema, columns, aliases, role/group lists |
| `src/contracts/compliance-library/schemas/index.ts`       | Zod schema for compliance library entity              |
| `.wayfinder/map.md`                                       | Wayfinder decision map                                |
| `knip.json`                                               | Dead code detection config                            |
| `.jscpd.json`                                             | Duplicate code detection config                       |
