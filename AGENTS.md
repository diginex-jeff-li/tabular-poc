# AGENTS.md

Guidance for **any coding agent** (Claude Code, Cursor, Antigravity, Gemini,
GitHub Copilot, Windsurf, Codex, ...) working in this repository.

> **This is the single source of truth.** Tool entrypoints reference it — edit
> `AGENTS.md` and every agent follows:
>
> - `CLAUDE.md`, `GEMINI.md` — import it via the `@AGENTS.md` directive.
> - `.cursorrules`, `.windsurfrules`, `.github/copilot-instructions.md` — one-line
>   pointers ("read AGENTS.md"). Cursor/Antigravity/Codex also read root `AGENTS.md` natively.

## Project

A reusable **fullstack boilerplate** for building demos with the SC1.5 tech
stack. A **pnpm workspace monorepo** (no Turborepo) with three packages:

- **`bp-contracts`** — Shared API contracts built with oRPC + Zod. SWC-compiled
  ESM output with tsc-generated declaration files. Consumed by both backend and
  frontend.
- **`bp-backend`** — NestJS 11 API server (port 3002). TypeORM 0.3.30 entities,
  migrations, seed data, Redis caching, and oRPC route handlers.
- **`bp-frontend`** — Vue 3.5 + TSX admin app (port 3500) powered by Vite 8,
  Nuxt UI v4, Pinia Colada, oRPC client, and Tailwind v4. Contains a sample
  item list page.

The sample **"item" domain resource** demonstrates the full pattern: contract
schemas, oRPC routes, backend entity/repository/service/controller, migration,
seed data, E2e tests, frontend API layer, and a page. Copy and rename to add
new domain resources.

Requires **Node >= 24** and **pnpm >= 11** (see `package.json`
`packageManager`). Use pnpm only.

## Commands

### Root

```bash
pnpm setup             # start docker services, install deps, build contracts, migrate, seed
pnpm dev               # run backend + frontend in parallel
pnpm build             # build contracts -> backend -> frontend (ordered)
pnpm test              # run all tests across packages
pnpm lint              # oxlint across all packages
pnpm fmt               # oxfmt write across all packages
```

### bp-contracts

```bash
pnpm --filter bp-contracts build        # SWC ESM + tsc declaration files -> dist
pnpm --filter bp-contracts lint         # oxlint src
pnpm --filter bp-contracts fmt          # oxfmt --write "src/**/*.ts"
pnpm --filter bp-contracts clean        # rm -rf dist
```

### bp-backend

```bash
pnpm --filter bp-backend start:dev      # NestJS dev (port 3002, --watch)
pnpm --filter bp-backend build          # nest build -> dist
pnpm --filter bp-backend start:prod     # node dist/main
pnpm --filter bp-backend tsc            # tsc --noEmit (typecheck)
pnpm --filter bp-backend test           # vitest run --config vitest.config.e2e.ts
pnpm --filter bp-backend test:watch     # vitest (watch mode)
pnpm --filter bp-backend test:e2e       # vitest run --config vitest.config.e2e.ts
pnpm --filter bp-backend migration:run  # build + node dist/apps/api/src/migrate.js run
pnpm --filter bp-backend migration:revert  # build + node dist/apps/api/src/migrate.js revert
pnpm --filter bp-backend seed           # build + node dist/apps/api/src/seed.js
pnpm --filter bp-backend lint           # oxlint apps libs
pnpm --filter bp-backend fmt            # oxfmt --write apps/**/src libs/**/src
```

### bp-frontend

```bash
pnpm --filter bp-frontend dev           # vite dev (port 3500)
pnpm --filter bp-frontend build         # vite build
pnpm --filter bp-frontend preview       # vite preview
pnpm --filter bp-frontend typecheck     # tsc --noEmit
pnpm --filter bp-frontend test          # vitest run (component tests)
pnpm --filter bp-frontend test:watch    # vitest (watch mode)
pnpm --filter bp-frontend lint          # oxlint apps
pnpm --filter bp-frontend fmt           # oxfmt --write "apps/**/src/**/*.{ts,tsx}"
```

Run a single app with `pnpm --filter <package-name> <script>`. The backend dev
server listens on port **3002**, the frontend on port **3500**.

### Services

The backend needs PostgreSQL 17 + Redis 7 running before migrations/seed:

```bash
cd bp-backend && docker compose up -d postgres redis
```

## Monorepo conventions

**Catalog deps in `pnpm-workspace.yaml`.** Every dependency version is declared
once in the catalog. Each `package.json` references it with
`"<dep>": "catalog:"` — never hard-code versions; bump in the catalog.

**Workspace packages.** Defined in `pnpm-workspace.yaml`:

```yaml
packages:
  - bp-backend
  - bp-frontend
  - bp-frontend/apps/*
  - bp-contracts
```

**allowBuilds.** Build scripts approved in `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  '@parcel/watcher': true
  '@swc/core': true
  esbuild: true
  vue-demi: true
```

**Supply chain security.** Consider adding these to `pnpm-workspace.yaml` for
production projects:

```yaml
minimumReleaseAge: 14
blockExoticSubdeps: true
onlyBuiltDependencies:
  - '@parcel/watcher'
  - '@swc/core'
  - esbuild
  - vue-demi
```

## Architecture

### Contracts (`bp-contracts`)

oRPC + Zod shared contracts. Per-resource folders under `src/`:
`schemas/`, `requests/`, `responses/`, `routes/`. Each exports a barrel
`index.ts`. The root `src/index.ts` aggregates all resources into a `contract`
object.

- **Build**: SWC compiles `src` -> `dist/esm` (ESM, source maps), `tsc -p
  tsconfig.build.json --emitDeclarationOnly` emits `dist/types`. Output is ESM
  with a flat `exports` map (per-resource subpath exports like
  `./item/routes`).
- **Consumed by** both `bp-backend` (via `@orpc/nest`) and `bp-frontend`
  (via `@orpc/client` + `@orpc/vue-colada`). Always rebuild contracts
  (`pnpm --filter bp-contracts build`) after changing them before running
  backend or frontend — both import from `dist/`.

### Backend (`bp-backend`)

NestJS 11 + TypeORM 0.3.30 + PostgreSQL 17 + Redis 7 + SWC.

- **Source layout**: `apps/api/src/` contains the app. Config modules in
  `config/` (`env.config.ts`, `database.config.ts`, `redis.config.ts`,
  `cache.config.ts`, `data-source.ts`, `orpc.config.ts`, `cors.config.ts`).
  Feature modules live per-domain (e.g. `item/` with entities, services,
  repositories, controllers, migrations, e2e specs). `health/` has the health
  check. `main.ts` bootstraps.
- **TypeORM**: entities use class decorators. `config/data-source.ts` defines
  the `DataSource` (used by the custom migration runner — NOT the TypeORM CLI,
  which doesn't support ESM data-source files). `@DeleteDateColumn` auto-filters
  soft-deleted rows via TypeORM's Paranoia.
- **oRPC + Nest**: controllers use `@Implement` from `@orpc/nest` to wire oRPC
  contract procedures to NestJS providers. Services are `@Injectable` and use
  `@InjectRepository(Entity)` for TypeORM injection.
- **Migrations**: run via the custom `migrate.ts` runner
  (`dist/apps/api/src/migrate.js`), NOT `typeorm` CLI. The CLI's ESM
  incompatibility means `pnpm migration:run` builds first then runs
  `node dist/.../migrate.js run`. Revert with `migration:revert`.
- **Seed**: `seed.ts` (`pnpm seed`) populates sample data (2 sample items).
- **TypeScript**: `tsconfig.base.json` sets `module: nodenext`,
  `moduleResolution: nodenext`, `experimentalDecorators` + `emitDecoratorMetadata`
  (required for TypeORM/NestJS decorator metadata), `strict: true`,
  `strictNullChecks: true`, `strictPropertyInitialization: false`. SWC transpiles
  at runtime via `unplugin-swc` (Vite/Vitest).

### Frontend (`bp-frontend`)

Vue 3.5 + Vite 8 + TSX (NOT SFCs) + Nuxt UI v4 + Pinia Colada + oRPC + Tailwind v4.

- **App location**: `apps/admin/`. Source in `src/`:
  `apis/` (oRPC client + per-resource API modules), `components/` (shared UI),
  `pages/` (route pages), `config/`, `styles/`, `types/`.
- **TSX components**: all components are `.tsx` using
  `defineComponent({ setup() { return (): VNode => <.../> } })` with a render
  function returning `VNode`. No SFCs, no `<script setup>`.
- **Nuxt UI v4**: registered via `ui({ autoImport: false, components: false,
  colorMode: false })` in `vite.config.ts` (default `U` prefix). Because
  components are TSX, Nuxt UI components do NOT auto-register — import each
  explicitly with the `U` prefix:
  `import UButton from '@nuxt/ui/components/Button.vue'`.
- **Auto-imports**: `unplugin-auto-import` configured in `vite.config.ts` for Vue
  APIs (`defineComponent`, `computed`, `ref`, etc.), `vue-router`, Pinia
  (`defineStore`, `createPinia`), Pinia Colada (`useQuery`, `useMutation`,
  `PiniaColada`, `defineQuery`, `defineMutation`, `useQueryCache`,
  `useMutationCache`), `@pinia/colada-plugin-retry` (`PiniaColadaRetry`), and
  type-only imports (`PropType`, `Ref`, `MaybeRef`, `MaybeRefOrGetter`).
  Generated decls live in `src/types/auto-imports.d.ts` (do not hand-edit).
- **oRPC client**: contract-first, uses **`OpenAPILink`** (NOT `RPCLink`) because
  `@orpc/nest` exposes RESTful routes. The client is typed as
  `ContractRouterClient<typeof contract>` — never pass contract types as
  generics to `createORPCClient<T>`. The single `orpc` utils instance is created
  via `createORPCVueColadaUtils` in `apis/orpc.ts`.
- **API layer**: `apis/<resource>.ts` exports named functions
  (`listItems`, `getItem`, `createItem`, ...) that call
  `orpc.<resource>.<procedure>.queryOptions()` or `.mutationOptions()` and
  return the result of `useQuery`/`useMutation` (auto-imported). Components and
  pages import these functions directly from `apis/<resource>` — never use the
  `orpc` client directly in UI code.
- **Pinia Colada retry**: `PiniaColadaRetry` imports from
  `@pinia/colada-plugin-retry`, NOT `@pinia/colada`.
- **Path aliases**: bare (no `@/`), per-app in `vite.config.ts` `resolve.alias`
  and `tsconfig.json` paths: `apis/`, `components/`, `config/`, `pages/`,
  `styles/`, `src/`.
- **TypeScript**: `target: esnext`, `module: esnext`, `jsx: "preserve"`,
  `jsxImportSource: "vue"`, `moduleResolution: "bundler"`, `strict: true`,
  `strictNullChecks: false`, `noImplicitAny: true`, `verbatimModuleSyntax: true`
  (use `import type` for type-only imports), `allowArbitraryExtensions: true`.
  TS 6 deprecates `baseUrl` — `ignoreDeprecations: "6.0"` is set in tsconfig.

## Conventions

- **TSX components**: `defineComponent({ setup() { return (): VNode => <.../> } })`,
  no SFCs, no `<script setup>`. Render functions return `VNode`, not
  `JSX.Element`.
- **Nuxt UI**: `import UButton from '@nuxt/ui/components/Button.vue'` (explicit
  import, `U` prefix). Composables import from `@nuxt/ui/composables/<name>`
  (e.g. `useToast`) — NOT the `@nuxt/ui` root.
- **oRPC**: contract-first, `OpenAPILink` (not `RPCLink`),
  `createORPCVueColadaUtils`. Client typed as
  `ContractRouterClient<typeof contract>`.
- **API layer**: `apis/<resource>.ts` exports named functions returning
  `useQuery`/`useMutation`. UI code imports from `apis/<resource>`, never uses
  the `orpc` client directly.
- **No comments** in source code. The ONLY comments allowed are functional
  `oxlint-disable` directives. Explain via clear names, not prose.
- **oxfmt**: single quotes, semicolons, trailing commas (all), 2-space indent,
  80 printWidth. Import order is enforced by oxfmt — let it sort.
- **oxlint**: lint with auto-fix (`oxlint --fix`). Configured per-package.
- **Path aliases**: bare (no `@/`), per-app in `vite.config.ts` and
  `tsconfig.json`. Cross-package shared code imported via `bp-contracts`
  workspace package name.
- **TypeORM**: entities with class decorators. Migrations via the custom
  `migrate.ts` runner (TypeORM 0.3.x CLI doesn't support ESM data-source files).
  `@DeleteDateColumn` auto-filters soft-deleted rows.
- **Zod 3.25.x**: use `z.string().uuid()` (NOT `z.uuid()`). Do not use
  `z.treeifyError` (not available in this version).

## Key gotchas (learned during development)

- **TypeORM 0.3.x CLI doesn't support ESM data-source files** — use the custom
  `migrate.ts` runner (`node dist/apps/api/src/migrate.js run`). The `typeorm`
  CLI script in `package.json` exists for reference but the `migration:run` and
  `migration:revert` scripts build first then invoke the custom runner.
- **@orpc/nest uses RESTful routes** — the frontend must use `OpenAPILink`, not
  `RPCLink`. Using `RPCLink` will fail to match the backend's route shape.
- **PiniaColadaRetry** imports from `@pinia/colada-plugin-retry`, NOT
  `@pinia/colada`. The `@pinia/colada` package only exports the base query/mutation
  composables.
- **TS 6 deprecates `baseUrl`** — add `ignoreDeprecations: "6.0"` to `tsconfig.json`
  to suppress the deprecation warning (see the frontend `tsconfig.json`).
- **Frontend `vitest.config.ts` needs the `AutoImport` plugin** for
  `defineComponent` and other auto-imported APIs to work in tests. Without it,
  component tests fail with `defineComponent is not defined`. The test config
  mirrors the `vite.config.ts` AutoImport setup.
- **Nuxt UI colorMode: false** in the vite config to prevent auto dark mode.
- **`<html class="light">`** in `index.html` to force light theme.
- **pnpm transitive deps in Docker**: `@orpc/nest` imports from `@orpc/openapi`,
  `@orpc/shared`, `@orpc/standard-server-*` which pnpm doesn't expose. Add all
  `@orpc/*` sub-packages as direct deps in backend package.json.
- **ORPCError instead of NestJS exceptions**: ORPC catches NestJS exceptions
  (NotFoundException, ForbiddenException, ConflictException) and returns 500.
  Use `throw new ORPCError('NOT_FOUND', { message: '...' })` for proper status
  codes.
- **OrpcExceptionFilter for guards**: NestJS guards run outside ORPC handlers,
  so ORPCError thrown from guards needs a NestJS exception filter
  (`@Catch(ORPCError)`) to map to HTTP responses.
- **reflect-metadata must be first import**: Add `import 'reflect-metadata';`
  as the first line of `main.ts` for decorator metadata.
- **vite.config.ts external for optional peer deps**: If a dependency dynamically
  imports an optional peer dep (like `@templatical/editor` imports `pusher-js`),
  add it to `build.rolldownOptions.external` to prevent build failures.
- **Dockerfile uses pnpm install in both stages**: pnpm symlinks break when
  `node_modules` is copied between Docker stages. Run `pnpm install --recursive`
  in the runner stage instead of copying from builder. Use
  `node-linker=hoisted` in `.npmrc` for Docker compatibility.

## Guardrail principles

This boilerplate follows the guardrail flywheel philosophy: each guardrail
catches a different class of error, and fast feedback loops keep developers in
flow.

### Modern engineering values

- **Strict guardrails + fast feedback loops**: oxlint runs in milliseconds,
  tsc typechecks in ~0.5s, vitest runs in ~15s. Every guardrail should be fast
  enough to run on every save.
- **Context in the repo**: `AGENTS.md`, `ARCHITECTURE.md`, and inline docs in
  config files explain every non-obvious decision. The repo is self-documenting.
- **Own your stack**: oxlint + oxfmt instead of ESLint + Prettier. Rust-native
  tooling for millisecond feedback.

### Layered quality pipeline

The quality pipeline is layered — each layer catches a different class of error:

1. **Type safety** (tsc): catches type errors at compile time
2. **Lint** (oxlint): catches code style and correctness issues in milliseconds
3. **Unit tests** (vitest): catches logic errors in isolation
4. **Component tests** (vitest + @vue/test-utils + happy-dom): catches frontend
   rendering and interaction bugs
5. **E2e tests** (vitest + supertest): catches integration bugs at the API route
   boundary with a real database

### Supply chain security

pnpm provides several supply chain guardrails. Consider enabling them in
`pnpm-workspace.yaml` for production projects:

- `minimumReleaseAge`: reject packages newer than N days (catches
  malicious-then-deleted attacks)
- `blockExoticSubdeps`: prevent exotic (git/file/http) dependencies
- `onlyBuiltDependencies` / `allowBuilds`: explicitly approve which packages can
  run postinstall build scripts

### Optional: Git hooks and API mocking

- **Lefthook** (or Husky): run lint + typecheck on pre-commit for fast feedback
  before push
- **MSW (Mock Service Worker)**: mock API responses in frontend tests for
  deterministic component testing without a backend

## Testing strategy

- **Vitest for all tests.**
- **Backend E2e specs**: `apps/**/src/**/*.e2e-spec.ts`
  (`vitest.config.e2e.ts`, `environment: node`, `fileParallelism: false`). E2e
  tests operate at the oRPC route boundary with a real PostgreSQL instance (not
  mocked). Run after `docker compose up -d postgres redis`.
  `fileParallelism: false` avoids DB contention.
- **Frontend component tests**: `apps/**/src/**/*.test.{ts,tsx}`
  (`bp-frontend/vitest.config.ts`, `environment: happy-dom`). Uses
  `@vue/test-utils` + `happy-dom`. The oRPC client is mocked; Nuxt UI components
  are mocked. The frontend `vitest.config.ts` includes the `AutoImport` plugin
  (matching `vite.config.ts`) so `defineComponent` and other auto-imported APIs
  work in tests.
- **Backend `test` script uses `vitest.config.e2e.ts`** because all backend
  tests are E2e (testing at the route boundary with a real DB).
