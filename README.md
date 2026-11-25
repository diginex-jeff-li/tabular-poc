# sc-tabulator

Tabulator grid editor prototype — compliance library admin grid.

A pnpm workspace monorepo with two packages:

- **`contracts/`** — Shared Zod schemas (oRPC removed, Zod only). SWC-compiled
  ESM + tsc declaration files. Consumed by frontend.
- **`frontend/`** — Vue 3.5 + TSX admin app (port 3500). Vite 8, Nuxt UI v4,
  Tailwind v4. Contains the Tabulator grid editor at `/`.

## Prerequisites

- Node >= 24
- pnpm >= 12

## Quick Start

```bash
pnpm install          # install all deps
pnpm dev              # run frontend dev server (port 3500)
```

Open <http://localhost:3500> to see the compliance library grid editor.

## Commands

```bash
pnpm install          # install all deps
pnpm dev              # run frontend dev server (port 3500)
pnpm build            # build contracts → frontend
pnpm test             # run all tests (contracts + frontend)
pnpm lint             # oxlint across all packages + root
pnpm fmt              # oxfmt across all packages
pnpm typecheck        # tsc --noEmit (contracts build first)
pnpm knip             # dead code detection
pnpm jscpd            # duplicate code detection
pnpm validate         # lint + typecheck + test + knip (full gate)
```

### contracts

```bash
pnpm --filter contracts build        # SWC ESM + tsc declarations → dist
pnpm --filter contracts test          # vitest run (Zod schema tests)
pnpm --filter contracts lint          # oxlint src
pnpm --filter contracts fmt           # oxfmt --write "src/**/*.ts"
```

### frontend

```bash
pnpm --filter @sc/admin dev           # vite dev (port 3500)
pnpm --filter @sc/admin build         # vite build
pnpm --filter @sc/admin typecheck     # tsc --noEmit
pnpm --filter @sc/admin test          # vitest run (component tests)
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

Vue 3.5 + Vite 8 + TSX (NOT SFCs) + Nuxt UI v4 + Tailwind v4.

- All components are `.tsx` using `defineComponent({ setup() { return (): VNode =>
<.../> } })` with render functions. No SFCs, no `<script setup>`.
- Nuxt UI v4 components imported explicitly with `U` prefix (no auto-registration).
- AutoImport configured for Vue + vue-router APIs only.
- Vite resolve aliases: `src`, `components`, `composables`, `config`, `pages`,
  `styles`, `utils`.

## Monorepo Conventions

**Catalog deps** — every dependency version declared once in `pnpm-workspace.yaml`
under `catalog:`. Each `package.json` references with `"<dep>": "catalog:"`.

**Guardrails** — oxlint (lint), oxfmt (format), vitest (tests), tsc (typecheck),
knip (dead code), jscpd (duplicate code). Run `pnpm validate` before committing.

**Pre-commit hooks** — husky + lint-staged run oxlint and oxfmt on staged files.
AGENTS.md is validated for documented commands on every commit.

**Naming conventions** — use camelCase for functions and variables, PascalCase for
components and types, kebab-case for file names of non-component modules. oxlint
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
| `frontend/apps/admin/src/pages/ComplianceGridEditor.tsx`  | Main grid editor page                                 |
| `frontend/apps/admin/src/utils/zodToTabulatorColumns.ts`  | Derive Tabulator column defs from Zod schema          |
| `frontend/apps/admin/src/composables/useDirtyTracking.ts` | Track added/modified/deleted rows for diff-based save |
| `contracts/src/compliance-library/schemas/index.ts`       | Zod schema for compliance library entity              |
| `.wayfinder/map.md`                                       | Wayfinder decision map                                |
| `knip.json`                                               | Dead code detection config                            |
| `.jscpd.json`                                             | Duplicate code detection config                       |
