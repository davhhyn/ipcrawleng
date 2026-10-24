# syntax=docker/dockerfile:1

# ── Build stage ───────────────────────────────────────────────────────────
FROM node:22-slim AS build

WORKDIR /app

# Install deps first so the layer caches across source edits.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

ENV NODE_ENV=production \
    NUXT_TELEMETRY_DISABLED=1 \
    NUXT_DATA_DIR=/data \
    NUXT_DB_PATH=/data/ipcrawl.sqlite \
    HOST=0.0.0.0 \
    PORT=3000

WORKDIR /app

# Nitro's node-server output is self-contained (it bundles its own modules),
# and `node:sqlite` needs no native build — so the runtime image carries no
# compiler and no node_modules tree.
COPY --from=build /app/.output ./.output

# The catalogue, thumbs and SWR cache all live on the volume.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

USER node

EXPOSE 3000

# The health endpoint touches neither the network nor the rate limiter.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
