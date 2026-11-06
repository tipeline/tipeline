FROM node:24-alpine AS builder
# node:24 ships with npm 11, which correctly honours --ignore-scripts
# for local workspace packages (npm 10 has a known bug that skips the flag)

WORKDIR /build

# Copy source before install so tsc can find files when builds run below
COPY package.json package-lock.json ./
COPY packages/ ./packages/
COPY apps/core/ ./apps/core/

# Install dependencies only — skip prepare/postinstall scripts because
# workspace packages must be built in topological order, not all at once
RUN npm install --workspaces --include-workspace-root --ignore-scripts

# Compile native addons that --ignore-scripts skipped (node-gyp requires build tools)
RUN apk add --no-cache python3 make g++ && npm rebuild better-sqlite3

# Build shared packages in dependency order, then core
RUN npm -w packages/types   run build
RUN npm -w packages/utils   run build
RUN npm -w packages/i18n    run build
RUN npm -w packages/schemas run build
RUN npm -w apps/core        run build

# ─────────────────────────────────────────────────────────────────────────────
# Runtime image — copy node_modules + built artifacts from builder.
# No npm install in this stage, so no lifecycle scripts fire at all.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime

WORKDIR /app

# Pre-installed node_modules from the builder (same alpine base = compatible)
COPY --from=builder /build/node_modules ./node_modules

# Workspace package manifests — required so node_modules symlinks can resolve main/exports
COPY --from=builder /build/packages/types/package.json   ./packages/types/package.json
COPY --from=builder /build/packages/schemas/package.json ./packages/schemas/package.json
COPY --from=builder /build/packages/utils/package.json   ./packages/utils/package.json
COPY --from=builder /build/packages/i18n/package.json    ./packages/i18n/package.json

# Compiled shared packages
COPY --from=builder /build/packages/types/dist        ./packages/types/dist
COPY --from=builder /build/packages/schemas/dist      ./packages/schemas/dist
COPY --from=builder /build/packages/utils/dist        ./packages/utils/dist
COPY --from=builder /build/packages/i18n/dist         ./packages/i18n/dist
COPY --from=builder /build/packages/i18n/locales      ./packages/i18n/locales

# Compiled core + migrations
COPY --from=builder /build/apps/core/dist             ./apps/core/dist

# Root package.json for Node workspace resolution
COPY package.json ./

# Persistent data directory (mount a volume over this path)
RUN mkdir -p /root/.tipeline/.database /root/.tipeline/logs

EXPOSE 4000

ENV TIPELINE_WS_PORT=4000
ENV TIPELINE_BIND_HOST=0.0.0.0

CMD ["node", "apps/core/dist/engine/Server.js"]
