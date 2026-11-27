# M2 Handoff — Custom Table Builder

> **For**: Next agent session (continuation of sc-tabulator prototype work)
> **From**: M1 session (Aug 10, 2026)
> **Repo**: `/Users/jeffli/Documents/Work/boilerplates/sc-tabulator`
> **GitHub**: `git@github.com:diginex-jeff-li/tabular-poc.git` (branch: `main`)

## Context

The sc-tabulator repo is a prototype of a Tabulator-based grid editor that replaces the Excel download/upload cycle for admin reference data. M1 is complete — a full-screen grid editor for the compliance library with paste-from-Excel, validation, dirty tracking, diff-based save, filtering, CSV export, and a licensing comparison panel. Data persists in an inline mock backend (in-memory).

The user (Jeff, Head of Engineering at Diginex ESG) wants to extend the prototype to support **user-defined custom tables** — where users create their own table structures (column name, type, choices) and fill them via the same grid editor. This is M2.

## What's Done (M1)

- **ComplianceGridEditor.tsx** (560 lines) — full-screen grid with toolbar, paste, validation, dirty tracking, save, error sidebar, empty-state overlay, licensing slide-over
- **useDirtyTracking.ts** — composable tracking added/modified/deleted rows for diff-based save
- **zodToTabulatorColumns.ts** — derives Tabulator column defs from a Zod schema
- **buildComplianceColumns.ts** — builds columns for the compliance library (includes checkbox column with clipboard:false, header filters)
- **contracts/** — shared Zod schemas for compliance library (22 tests)
- **frontend tests** — 24 tests total (ComplianceGridEditor, zodToTabulatorColumns, useDirtyTracking)
- **Guardrails** — oxlint, oxfmt, vitest, tsc, knip, pnpm validate

## M2 Decisions (from grilling session)

Read `.wayfinder/m2-map.md` for the full decision table and ticket list.
Read `git show 610d9df:spec-m2.md` for interface contracts (GridEditor props, useGridEditor returns, localStorage schema, route structure).

Key decisions:
- localStorage persistence (no backend)
- Text + Dropdown + Number field types
- Add columns only after data exists (no rename/delete/type-change)
- Shared engine: extract GridEditor component + useGridEditor composable from M1
- Runtime Zod builder from column definitions
- List view → column builder → grid editor (three pages under `/custom`)
- All M1 features available in custom tables
- Column builder uses Nuxt UI table component

## M2 Tickets (wayfinder)

1. **Extract GridEditor + useGridEditor** (refactor M1) — frontier
2. **Runtime Zod builder** (`buildRuntimeSchema.ts`) — frontier
3. **definitionToColumns** (`definitionToColumns.ts`) — frontier
4. **Column builder page** (`/custom/new`) — blocked by 02, 03
5. **Custom table list page** (`/custom`) — frontier
6. **Custom table editor page** (`/custom/:tableId`) — blocked by 01, 02, 03

Tickets 01, 02, 03, 05 can be done in parallel. Then 04, then 06.

## Key Files to Read

```
frontend/apps/admin/src/pages/ComplianceGridEditor.tsx  — the file to refactor (560 lines)
frontend/apps/admin/src/composables/useDirtyTracking.ts — dirty tracking pattern
frontend/apps/admin/src/composables/buildComplianceColumns.ts — column builder pattern
frontend/apps/admin/src/utils/zodToTabulatorColumns.ts  — Zod→Tabulator mapping
frontend/apps/admin/src/config/router.ts                — route definitions
frontend/apps/admin/vite.config.ts                      — aliases, plugins
git show 610d9df:spec-m2.md                             — interface contracts
.wayfinder/m2-map.md                                    — decisions + tickets
```

## Stack Constraints

- **Vue 3.5 + TSX only** (no SFCs, no `<script setup>`) — `defineComponent({ setup() { return (): VNode => <.../> } })`
- **Nuxt UI v4** — components imported explicitly with `U` prefix (e.g., `import UButton from '@nuxt/ui/components/Button.vue'`)
- **Vite 8** with `@vitejs/plugin-vue-jsx`
- **Tabulator 6.5.2** — `TabulatorFull as Tabulator` from `tabulator-tables`
- **Zod 3.25** for validation
- **pnpm workspace** with explicit versions
- **AutoImport** for Vue + vue-router APIs only

## Guardrails (run before committing)

```bash
pnpm --filter contracts build && pnpm --filter contracts test
cd frontend && npx vitest run
pnpm --filter @sc/admin lint
pnpm --filter contracts lint
```

## Process

- Use TDD: write failing tests first, then implement to pass
- Use `/wayfinder` ticket workflow: one ticket at a time, close in map when done
- Use jj-vcs for commits: `jj describe -m "..."`, `jj new`, `jj bookmark set -r @- main`, `git push`
- Verify in browser after each ticket (dev server on port 3500 or 3501)
- Run all gates before committing

## What NOT to Do

- Don't add a backend (M2 is localStorage only)
- Don't add auth (prototype)
- Don't add min/max/integer constraints to Number type
- Don't allow column rename/delete/type-change after data exists (add only)
- Don't create SFCs (.vue files) — TSX only
- Don't skip the refactor (Q16) — M1 must be refactored to use the shared GridEditor component, not duplicated