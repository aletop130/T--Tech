# syntax=docker/dockerfile:1
# ============================================
# Stage 1: Install dependencies with Bun
# ============================================
FROM oven/bun:1-alpine AS dependencies

WORKDIR /app

COPY package.json bun.lock* ./

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --ignore-scripts

# ============================================
# Stage 2: Dev (used by docker-compose)
# Volume mount overrides /app, so only
# node_modules (named volume) matters here.
# ============================================
FROM oven/bun:1-alpine AS dev

RUN apk add --no-cache curl nodejs

WORKDIR /app

COPY package.json ./
COPY --from=dependencies /app/node_modules ./node_modules

EXPOSE 3000

CMD ["bun", "run", "dev"]

# ============================================
# Stage 3: Build Next.js application
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN node scripts/copy-cesium-assets.js
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# ============================================
# Stage 4: Production runner (minimal image)
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN apk add --no-cache curl

COPY --from=builder --chown=node:node /app/public ./public
RUN mkdir .next && chown node:node .next
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000

CMD ["node", "server.js"]
