// Package sidecar runs the auth sidecar (Better Auth on Node, web/server/) as a child process of the API, restarts
// it when it dies, and gives up when it keeps dying, so that the app never runs on without auth.
package sidecar

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"syscall"
	"time"
)

// Config says what to run and how hard to try.
type Config struct {
	// Command is the program and its arguments, for example node and the sidecar's script.
	Command []string
	// Env is the child's whole environment.
	Env    []string
	Logger *slog.Logger
	// MaxExits is how many exits within Window are tolerated; one more and Run returns an error. Default 5 in 1m.
	MaxExits int
	Window   time.Duration
	// Backoff returns the pause before restart number n (1, 2, …). Default: 1s, 2s, 4s, … up to 10s.
	Backoff func(n int) time.Duration
	// StopTimeout is how long the child gets to exit after SIGTERM before it is killed. Default 5s.
	StopTimeout time.Duration
}

// Run starts the sidecar and restarts it whenever it exits, until ctx is done; then it stops the sidecar (SIGTERM,
// then SIGKILL after StopTimeout) and returns nil. It returns an error when the sidecar cannot be started or exits
// more than MaxExits times within Window: the caller then stops the app, and the platform restarts it.
func Run(ctx context.Context, cfg Config) error {
	if len(cfg.Command) == 0 {
		return errors.New("sidecar: no command")
	}
	if cfg.MaxExits <= 0 {
		cfg.MaxExits = 5
	}
	if cfg.Window <= 0 {
		cfg.Window = time.Minute
	}
	if cfg.Backoff == nil {
		cfg.Backoff = func(n int) time.Duration {
			return min(time.Second<<min(n-1, 4), 10*time.Second)
		}
	}
	if cfg.StopTimeout <= 0 {
		cfg.StopTimeout = 5 * time.Second
	}
	log := cfg.Logger
	if log == nil {
		log = slog.Default()
	}

	var exits []time.Time
	for restart := 0; ; restart++ {
		start := time.Now()
		err := runOnce(ctx, cfg)
		if ctx.Err() != nil {
			log.Info("auth sidecar stopped")
			return nil
		}
		var startErr *startError
		if errors.As(err, &startErr) {
			return err
		}
		now := time.Now()
		exits = append(exits, now)
		for len(exits) > 0 && now.Sub(exits[0]) > cfg.Window {
			exits = exits[1:]
		}
		log.Error("auth sidecar exited", "err", err, "ran_for_ms", now.Sub(start).Milliseconds(),
			"exits_in_window", len(exits))
		if len(exits) > cfg.MaxExits {
			return fmt.Errorf("auth sidecar exited %d times within %s, last: %w", len(exits), cfg.Window, err)
		}
		pause := cfg.Backoff(len(exits))
		log.Info("restarting the auth sidecar", "in_ms", pause.Milliseconds())
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(pause):
		}
	}
}

type startError struct{ err error }

func (e *startError) Error() string { return "start auth sidecar: " + e.err.Error() }
func (e *startError) Unwrap() error { return e.err }

func runOnce(ctx context.Context, cfg Config) error {
	cmd := exec.CommandContext(ctx, cfg.Command[0], cfg.Command[1:]...) //nolint:gosec // the command is our own config
	cmd.Env = cfg.Env
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Cancel = func() error { return cmd.Process.Signal(syscall.SIGTERM) }
	cmd.WaitDelay = cfg.StopTimeout
	setParentDeathSignal(cmd)
	if err := cmd.Start(); err != nil {
		return &startError{err}
	}
	err := cmd.Wait()
	if err == nil {
		err = errors.New("exited with status 0")
	}
	return err
}

// Check answers nil when the sidecar answers 200 at url (Better Auth's /api/auth/ok).
func Check(ctx context.Context, client *http.Client, url string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	_ = res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("auth sidecar: GET %s: %s", url, res.Status)
	}
	return nil
}
