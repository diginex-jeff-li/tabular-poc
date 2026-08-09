# SC Boilerplate

A reusable fullstack boilerplate for building demos with the SC1.5 tech stack.

## Quick Start

```bash
pnpm setup
pnpm dev
```

This will:
1. Start PostgreSQL and Redis via Docker
2. Install all workspace dependencies
3. Build the shared contracts package
4. Run database migrations
5. Seed sample data

Then start both the backend (port 3002) and frontend (port 3500) in parallel.

## Manual Setup

If you prefer to run each step manually:

```bash
# 1. Install dependencies
pnpm install --recursive

# 2. Start PostgreSQL + Redis
cd bp-backend && docker compose up -d postgres redis

# 3. Copy env file
cp bp-backend/.env.example bp-backend/.env

# 4. Build contracts (backend and frontend depend on this)
pnpm --filter bp-contracts build

# 5. Run migrations
pnpm --filter bp-backend migration:run

# 6. Seed sample data
pnpm --filter bp-backend seed

# 7. Start dev servers
pnpm dev
```

## Usage URLs

| Service    | URL                          |
| ---------- | ---------------------------- |
| Backend API | http://localhost:3002/api    |
| Health check | http://localhost:3002/api/health |
| Frontend   | http://localhost:3500        |
| PostgreSQL | localhost:5432               |
| Redis      | localhost:6379               |

## How to Add a New Domain Resource

Follow the "item" sample as a template. For a new resource called "product":

### 1. Add contracts (`bp-contracts`)

Create `src/product/` with:
- `schemas/index.ts` — Zod schemas (`ProductSchema`, enums)
- `requests/index.ts` — request schemas (`ListProductsRequestSchema`, etc.)
- `responses/index.ts` — response schemas
- `routes/index.ts` — oRPC routes using `oc.route()`
- `index.ts` — barrel exports

Add to `src/index.ts`:
```ts
import { productRoutes } from './product/routes/index.js';

export const contract = {
  item: itemRoutes,
  product: productRoutes,
};
```

Add subpath exports to `bp-contracts/package.json` (copy the `./item/*` entries).

### 2. Add backend (`bp-backend`)

Create `apps/api/src/product/` with:
- `entities/product.entity.ts` — TypeORM entity
- `repositories/product.repository.ts` — repository class
- `services/product.service.ts` — `@Injectable` service with CRUD methods
- `controllers/product.controller.ts` — `@Implement` oRPC handlers
- `migrations/0000000000001-create-products-table.ts` — migration
- `product.module.ts` — NestJS module

Register the module in `app.module.ts`.

### 3. Add frontend (`bp-frontend`)

Create `apps/admin/src/apis/product.ts`:
```ts
import { orpc } from './orpc';

export function listProducts(input: MaybeRefOrGetter<{...}>) {
  return useQuery(orpc.product.listProducts.queryOptions({ input: () => toValue(input) }));
}
```

Create a page in `apps/admin/src/pages/ProductListPage.tsx` and add a route in
`config/router.ts`.

### 4. Rebuild and test

```bash
pnpm --filter bp-contracts build
pnpm --filter bp-backend migration:run
pnpm --filter bp-backend seed
pnpm dev
```

## Testing

```bash
# All tests
pnpm test

# Backend E2e tests (requires Docker services running)
cd bp-backend && docker compose up -d postgres redis
pnpm --filter bp-backend test

# Frontend component tests
pnpm --filter bp-frontend test

# Lint all packages
pnpm lint

# Format all packages
pnpm fmt
```

## Project Structure

```
sc-boilerplate/
├── package.json                # workspace root (pnpm)
├── pnpm-workspace.yaml         # catalog + workspace packages
├── AGENTS.md                   # coding conventions (single source of truth)
├── ARCHITECTURE.md             # mermaid diagrams of the stack
├── .oxfmtrc.json               # shared format config
├── bp-contracts/               # shared contracts (oRPC + Zod)
│   └── src/
│       ├── index.ts            # root contract object
│       ├── common/             # shared schemas (pagination, UUID, HTTP codes)
│       └── item/               # sample domain resource
│           ├── schemas/        # Zod schemas
│           ├── requests/       # request schemas
│           ├── responses/      # response schemas
│           └── routes/         # oRPC route definitions
├── bp-backend/                 # NestJS backend
│   ├── docker-compose.yml      # postgres + redis
│   ├── .env.example            # template env file
│   └── apps/api/src/
│       ├── main.ts             # bootstrap
│       ├── app.module.ts       # root module
│       ├── config/             # env, database, redis, cache, oRPC, CORS
│       ├── health/             # health check
│       ├── migrate.ts          # custom ESM migration runner
│       ├── seed.ts             # sample seed data
│       └── item/               # sample domain feature module
│           ├── entities/       # TypeORM entity
│           ├── repositories/   # repository
│           ├── services/       # service (CRUD)
│           ├── controllers/    # oRPC controller (@Implement)
│           ├── migrations/     # SQL migration
│           └── item.e2e-spec.ts # E2e test
└── bp-frontend/                # Vue 3 frontend
    ├── .env.development
    └── apps/admin/
        ├── index.html          # Google Fonts + class="light"
        ├── vite.config.ts      # Nuxt UI (colorMode: false), AutoImport
        └── src/
            ├── main.ts
            ├── styles/         # Tailwind + Diginex theme
            ├── config/         # router, pinia-colada
            ├── components/     # Application root
            ├── apis/           # oRPC client + per-resource API modules
            └── pages/          # route pages
```
