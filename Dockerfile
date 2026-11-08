# ============================================================================
# Stage 1: Build TypeScript + React + Vite Application
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifests first to leverage Docker layer caching
COPY package.json package-lock.json* ./

# Install dependencies cleanly
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# Copy application source code and configuration
COPY index.html tsconfig.json vite.config.ts tailwind.config.js postcss.config.js ./
COPY server ./server
COPY src ./src

# Type-check and build production bundle into /app/dist
RUN npm run build

# ============================================================================
# Stage 2: Production Node.js Server + MinIO S3 Music Gateway (Port 5013)
# ============================================================================
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5013

# Copy production server (serves /dist + /api/music/* MinIO S3 Gateway) and compiled frontend
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server ./server
COPY --from=builder /app/dist ./dist

EXPOSE 5013

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5013/healthz || exit 1

CMD ["node", "server/index.mjs"]
