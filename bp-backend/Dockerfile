# syntax=docker/dockerfile:1

# =============================================================================
# Stage 1: builder
# =============================================================================
FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

WORKDIR /repo

# Copy workspace configuration first for better layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY bp-contracts/package.json bp-contracts/
COPY bp-backend/package.json bp-backend/
COPY bp-frontend/package.json bp-frontend/
COPY bp-frontend/apps/admin/package.json bp-frontend/apps/admin/

# Install all workspace dependencies (hoisted for Docker)
RUN echo "node-linker=hoisted" > .npmrc && pnpm install --recursive

# Copy full source for the packages we need to build
COPY bp-contracts/ bp-contracts/
COPY bp-backend/ bp-backend/

# Build contracts first (backend depends on bp-contracts dist)
RUN pnpm --filter bp-contracts build

# Build backend with SWC (ESM output - same as dev mode)
RUN pnpm --filter bp-backend build

# =============================================================================
# Stage 2: runner
# =============================================================================
FROM node:24-alpine AS runner

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

ENV NODE_ENV=production

WORKDIR /repo

# Copy workspace config + all package.json files for pnpm install
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY bp-contracts/package.json bp-contracts/
COPY bp-backend/package.json bp-backend/
COPY bp-frontend/package.json bp-frontend/
COPY bp-frontend/apps/admin/package.json bp-frontend/apps/admin/

# Install all dependencies (use hoisted node-linker for Docker compatibility - pnpm symlinks break in multi-stage builds)
RUN echo "node-linker=hoisted" > .npmrc && pnpm install --recursive

# Copy built dist from builder
COPY --from=builder /repo/bp-backend/dist ./bp-backend/dist
COPY --from=builder /repo/bp-contracts/dist ./bp-contracts/dist

WORKDIR /repo/bp-backend

EXPOSE 3002

# Default command: run migrations, seed, then start the API
CMD ["sh", "-c", "node dist/apps/api/src/migrate.js run && node dist/apps/api/src/seed.js && node dist/apps/api/src/main.js"]
