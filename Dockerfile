# One image for Railway: the Go API, which also serves the built web app.

# 1. The web app: web/dist
FROM node:22-alpine AS web
RUN npm install -g pnpm@12
WORKDIR /src/web
COPY web/package.json web/pnpm-lock.yaml ./
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

# 3. The final image: the binary and the web app only
FROM gcr.io/distroless/static-debian12
WORKDIR /app
COPY --from=api /out/brandy /app/brandy
COPY --from=web /src/web/dist /app/web
# Railway sets PORT. Mount a volume at /data to keep the database across deploys.
ENV PORT=8080 \
    DATABASE_PATH=/data/brandy.db \
    WEB_DIR=/app/web
EXPOSE 8080
ENTRYPOINT ["/app/brandy"]
