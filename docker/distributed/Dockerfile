FROM node:24-slim AS builder

# Build tools needed for native modules (better-sqlite3, sharp, etc.)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root manifest + app manifests (the apps are not built by prepare, so
# they only need their package.json for workspace resolution).
COPY package.json package-lock.json ./
COPY apps/core/package.json apps/core/
COPY apps/cli/package.json apps/cli/
COPY apps/desktop/package.json apps/desktop/

# All packages must be copied before npm ci: the root "prepare" script builds
# them in dependency order.
COPY packages/ packages/

RUN npm ci

# Copy apps/core source in a separate layer (changes more often than packages).
COPY apps/core/ apps/core/
RUN npm -w apps/core run build

# ──────────────────────────────────────────────────────────────────────────────
FROM node:24-slim AS runtime

# Needed at runtime for native addons (better-sqlite3, sharp).
RUN apt-get update \
  && apt-get install -y --no-install-recommends libstdc++6 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Minimal package manifests for workspace symlink resolution at runtime.
COPY package.json ./
COPY packages/schemas/package.json packages/schemas/
COPY packages/types/package.json packages/types/
COPY packages/utils/package.json packages/utils/
COPY packages/i18n/package.json packages/i18n/
COPY apps/core/package.json apps/core/

# node_modules already compiled for Linux — copy from builder, no npm ci needed.
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/packages/ packages/
COPY --from=builder /app/apps/core/dist apps/core/dist

WORKDIR /app/apps/core

CMD ["node", "dist/engine/worker/WorkerServer.js"]
