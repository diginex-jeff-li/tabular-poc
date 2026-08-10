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
COPY bp-frontend/ bp-frontend/

# Build contracts first (frontend imports types from bp-contracts dist)
RUN pnpm --filter bp-contracts build

# Build the frontend (vite build). API_URL is passed via build arg.
# The vite.config.ts reads API_URL from env (loadEnv from the workspace root).
ARG API_URL=http://localhost:3002/api
ENV API_URL=${API_URL}

RUN pnpm --filter @bp/admin build

# =============================================================================
# Stage 2: runner
# =============================================================================
FROM nginx:alpine AS runner

# Remove default nginx static assets and config
RUN rm -rf /usr/share/nginx/html/*

# Copy built SPA files
COPY --from=builder /repo/bp-frontend/apps/admin/dist/ /usr/share/nginx/html/

# Copy custom nginx config
COPY bp-frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3500

CMD ["nginx", "-g", "daemon off;"]
