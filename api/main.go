// Command api is brandy's server and the image's one entry point: the JSON API, the health check, the built web
// app, and the auth sidecar (Better Auth on Node, web/server/), which it runs as a child process and proxies
// /api/auth/* to.
//
// Environment: see .env.example and LoadConfig.
package main

import (
	"context"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/gutnikov/brandy/api/internal/auth"
	"github.com/gutnikov/brandy/api/internal/db"
	"github.com/gutnikov/brandy/api/internal/server"
	"github.com/gutnikov/brandy/api/internal/sidecar"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(log)
	if err := run(log); err != nil {
		log.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := LoadConfig(os.Getenv, fileExists)
	if err != nil {
		return err
	}
	if cfg.Secret == DevSecret {
		log.Warn("BETTER_AUTH_SECRET is not set: using the development secret (never on Railway)")
	}

	conn, err := db.Open(ctx, cfg.DBPath)
	if err != nil {
		return err
	}
	defer func() { _ = conn.Close() }()
	applied, err := db.Migrate(ctx, conn, db.Migrations)
	if err != nil {
		return err
	}
	log.Info("database ready", "path", cfg.DBPath, "migrations_applied", applied)

	// The auth sidecar starts after the migrations: it checks that Better Auth's tables are there.
	sidecarEnv, err := cfg.SidecarEnv(os.Environ())
	if err != nil {
		return err
	}
	sidecarCtx, stopSidecar := context.WithCancel(context.Background())
	defer stopSidecar()
	sidecarDone := make(chan error, 1)
	go func() {
		sidecarDone <- sidecar.Run(sidecarCtx, sidecar.Config{Command: cfg.SidecarCommand(), Env: sidecarEnv, Logger: log})
	}()
	authURL := &url.URL{Scheme: "http", Host: "127.0.0.1:" + cfg.AuthPort}
	authClient := &http.Client{Timeout: 2 * time.Second}
	authCheck := func(ctx context.Context) error {
		return sidecar.Check(ctx, authClient, authURL.String()+"/api/auth/ok")
	}
	go logWhenReady(ctx, log, authCheck)
	log.Info("auth", "base_url", cfg.BaseURL, "trusted_origins", cfg.TrustedOrigins, "sidecar", cfg.SidecarCommand())

	var web fs.FS
	if _, err := os.Stat(filepath.Join(cfg.WebDir, "index.html")); err == nil {
		web = os.DirFS(cfg.WebDir)
		log.Info("serving the web app", "dir", cfg.WebDir)
	} else {
		log.Warn("no built web app: only the API is served", "dir", cfg.WebDir)
	}

	srv := &http.Server{
		Addr: ":" + cfg.Port,
		Handler: server.New(server.Config{
			DB:        conn,
			Logger:    log,
			Web:       web,
			Sessions:  &auth.Sessions{DB: conn, Secret: cfg.Secret},
			Auth:      server.AuthProxy(authURL, cfg.Railway, log),
			AuthCheck: authCheck,
		}),
		ReadHeaderTimeout: 10 * time.Second,
	}
	errc := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", srv.Addr)
		errc <- srv.ListenAndServe()
	}()

	var runErr error
	select {
	case runErr = <-errc:
	case err := <-sidecarDone:
		// The sidecar keeps dying (or cannot start): stop rather than run on without auth.
		sidecarDone <- nil
		runErr = errors.Join(errors.New("the auth sidecar is down"), err)
	case <-ctx.Done():
	}
	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		runErr = errors.Join(runErr, err)
	}
	stopSidecar()
	if err := <-sidecarDone; err != nil {
		runErr = errors.Join(runErr, err)
	}
	return runErr
}

// logWhenReady logs once the sidecar first answers, or an error if it has not after a minute.
func logWhenReady(ctx context.Context, log *slog.Logger, check func(context.Context) error) {
	start := time.Now()
	for time.Since(start) < time.Minute {
		if check(ctx) == nil {
			log.Info("auth sidecar ready", "after_ms", time.Since(start).Milliseconds())
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(250 * time.Millisecond):
		}
	}
	log.Error("auth sidecar not answering after a minute")
}
