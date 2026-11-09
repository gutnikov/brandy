// Package server holds the HTTP handlers: the API under /api, the auth sidecar's endpoints under /api/auth, the
// health check, and the built web app.
package server

import (
	"context"
	"encoding/json"
	"io/fs"
	"log/slog"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/gutnikov/brandy/api/internal/auth"
)

// Pinger is what the health check needs from the database.
type Pinger interface {
	PingContext(ctx context.Context) error
}

// Config is what the handler serves.
type Config struct {
	DB     Pinger
	Logger *slog.Logger
	// Web is the built web app (index.html and its assets); nil serves no web app.
	Web fs.FS
	// Sessions resolves the signed-in user for the API's own endpoints; nil: nobody is signed in.
	Sessions *auth.Sessions
	// Auth serves /api/auth/*: the proxy to the auth sidecar (AuthProxy); nil answers 503.
	Auth http.Handler
	// AuthCheck says whether the auth sidecar answers; /healthz fails when it does not. nil: no check.
	AuthCheck func(context.Context) error
}

// New returns the application's HTTP handler.
func New(cfg Config) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", healthz(cfg.DB, cfg.AuthCheck, cfg.Logger))
	mux.HandleFunc("GET /api/hello", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"message": "hello"})
	})
	authProxy := cfg.Auth
	if authProxy == nil {
		authProxy = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "auth is not available"})
		})
	}
	mux.Handle("/api/auth/", authProxy)
	// signedIn wraps the API's own endpoints that need a signed-in user: 401 otherwise.
	signedIn := func(h http.HandlerFunc) http.Handler {
		if cfg.Sessions == nil {
			return auth.RequireUser(h)
		}
		return cfg.Sessions.Middleware(auth.RequireUser(h))
	}
	mux.Handle("GET /api/me", signedIn(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, auth.UserFrom(r.Context()))
	}))
	mux.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
	})
	mux.Handle("/", spa(cfg.Web))
	return logRequests(cfg.Logger, mux)
}

func healthz(db Pinger, authCheck func(context.Context) error, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := db.PingContext(ctx); err != nil {
			log.ErrorContext(ctx, "healthz: database ping failed", "err", err)
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable", "failed": "database"})
			return
		}
		if authCheck != nil {
			if err := authCheck(ctx); err != nil {
				log.ErrorContext(ctx, "healthz: auth sidecar check failed", "err", err)
				writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable", "failed": "auth"})
				return
			}
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// spa serves the files of the built web app, and index.html for any other path, so that the client-side router
// handles it.
func spa(web fs.FS) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if web == nil {
			http.NotFound(w, r)
			return
		}
		name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if name != "" && name != "index.html" {
			if info, err := fs.Stat(web, name); err == nil && !info.IsDir() {
				if strings.HasPrefix(name, "assets/") {
					// Vite puts a content hash in every file name under assets/.
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				}
				http.ServeFileFS(w, r, web, name)
				return
			}
		}
		if _, err := fs.Stat(web, "index.html"); err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		// Not http.ServeFileFS: it redirects a request for /index.html to /.
		body, err := fs.ReadFile(web, "index.html")
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		if r.Method == http.MethodGet {
			_, _ = w.Write(body)
		}
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func logRequests(log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		log.InfoContext(r.Context(), "request",
			"method", r.Method, "path", r.URL.Path, "status", rec.status,
			"duration_ms", time.Since(start).Milliseconds())
	})
}
