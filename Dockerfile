# syntax=docker/dockerfile:1

# ─── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Enable pnpm via corepack before copying sources
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# ─── Stage 2: production image ────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# git is required by simple-git for remote repository cloning
RUN apk add --no-cache git && corepack enable

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./

# Install production dependencies only (no devDependencies)
RUN pnpm install --frozen-lockfile --prod

# Run as a non-root user for an extra layer of isolation
RUN addgroup -S inspector && adduser -S -G inspector inspector
USER inspector

# Use an absolute path so WorkingDir (set to /tmp by the host for sandbox mode)
# does not affect module resolution
ENTRYPOINT ["node", "/app/dist/index.js"]
