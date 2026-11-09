// Command api is brandy's server: the JSON API, the health check and, in production, the built web app.
//
// Environment: PORT (default 8080), DATABASE_PATH (default ./data/brandy.db), WEB_DIR (default ./web/dist).
package main

import (
	"context"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/gutnikov/brandy/api/internal/db"
	"github.com/gutnikov/brandy/api/internal/server"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(log)
	if err := run(log); err != nil {
		log.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func run(log *slog.Logger) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	port := env("PORT", "8080")
	dbPath := env("DATABASE_PATH", "./data/brandy.db")
	webDir := env("WEB_DIR", "./web/dist")

	conn, err := db.Open(ctx, dbPath)
	if err != nil {
		return err
	}
	defer func() { _ = conn.Close() }()
	applied, err := db.Migrate(ctx, conn, db.Migrations)
	if err != nil {
		return err
	}
	log.Info("database ready", "path", dbPath, "migrations_applied", applied)

	var web fs.FS
	if _, err := os.Stat(filepath.Join(webDir, "index.html")); err == nil {
		web = os.DirFS(webDir)
		log.Info("serving the web app", "dir", webDir)
	} else {
		log.Warn("no built web app: only the API is served", "dir", webDir)
	}

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           server.New(server.Config{DB: conn, Logger: log, Web: web}),
		ReadHeaderTimeout: 10 * time.Second,
	}
	errc := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", srv.Addr)
		errc <- srv.ListenAndServe()
	}()

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}
	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
