# One image for Railway, one entry point: the Go API (/app/brandy). It serves the built web app and runs the auth
# sidecar (Better Auth on Node, web/server/) as its child process, restarting it if it dies.

# 1. The web app (web/dist) and the auth sidecar bundled into one file (web/dist-server/main.mjs)
FROM node:22-alpine AS web
RUN npm install -g pnpm@12
WORKDIR /src/web
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm run build

# 2. The API: a static binary (modernc.org/sqlite is pure Go, so no cgo)
FROM golang:1.26-alpine AS api
WORKDIR /src/api
COPY api/go.mod api/go.sum ./
RUN go mod download
COPY api/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/brandy .

# 3. The final image: Node for the sidecar (node:sqlite is built in: no native module, no node_modules), the
#    binary, the web app and the sidecar's bundle.
FROM node:22-alpine
WORKDIR /app
COPY --from=api /out/brandy /app/brandy
COPY --from=web /src/web/dist /app/web
COPY --from=web /src/web/dist-server/main.mjs /app/auth/main.mjs
# Railway sets PORT, RAILWAY_PUBLIC_DOMAIN and BETTER_AUTH_SECRET (required there). Mount a volume at /data to keep
# the database across deploys.
ENV PORT=8080 \
    DATABASE_PATH=/data/brandy.db \
    WEB_DIR=/app/web \
    AUTH_SIDECAR=/app/auth/main.mjs \
    NODE_ENV=production
EXPOSE 8080
ENTRYPOINT ["/app/brandy"]
