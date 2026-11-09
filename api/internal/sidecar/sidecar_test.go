package sidecar_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/gutnikov/brandy/api/internal/sidecar"
)

// The test binary plays the sidecar when FAKE_SIDECAR is set: "crash" exits 1 at once, "serve" waits for SIGTERM
// and then exits, after writing a line to FAKE_SIDECAR_LOG.
func TestMain(m *testing.M) {
	switch os.Getenv("FAKE_SIDECAR") {
	case "crash":
		os.Exit(1)
	case "serve":
		logLine("started")
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGTERM)
		<-sig
		logLine("got SIGTERM")
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func logLine(s string) {
	f, err := os.OpenFile(os.Getenv("FAKE_SIDECAR_LOG"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		panic(err)
	}
	_, _ = f.WriteString(s + "\n")
	_ = f.Close()
}

func config(mode, logFile string) sidecar.Config {
	return sidecar.Config{
		Command: []string{os.Args[0]},
		Env:     append(os.Environ(), "FAKE_SIDECAR="+mode, "FAKE_SIDECAR_LOG="+logFile),
		Logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
		Backoff: func(int) time.Duration { return time.Millisecond },
	}
}

func TestRunGivesUpWhenTheSidecarKeepsCrashing(t *testing.T) {
	cfg := config("crash", filepath.Join(t.TempDir(), "log"))
	cfg.MaxExits = 3
	errc := make(chan error, 1)
	go func() { errc <- sidecar.Run(context.Background(), cfg) }()
	select {
	case err := <-errc:
		if err == nil || !strings.Contains(err.Error(), "exited 4 times") {
			t.Fatalf("Run() = %v, want an error after 4 exits", err)
		}
	case <-time.After(20 * time.Second):
		t.Fatal("Run() did not give up")
	}
}

func TestRunStopsTheSidecarWithSIGTERM(t *testing.T) {
	logFile := filepath.Join(t.TempDir(), "log")
	ctx, cancel := context.WithCancel(context.Background())
	errc := make(chan error, 1)
	go func() { errc <- sidecar.Run(ctx, config("serve", logFile)) }()

	waitFor(t, logFile, "started\n")
	cancel()
	select {
	case err := <-errc:
		if err != nil {
			t.Fatalf("Run() = %v, want nil", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("Run() did not return after cancel")
	}
	waitFor(t, logFile, "started\ngot SIGTERM\n")
}

func TestRunFailsWhenTheCommandIsMissing(t *testing.T) {
	cfg := config("serve", "")
	cfg.Command = []string{filepath.Join(t.TempDir(), "no-such-program")}
	var err error
	done := make(chan struct{})
	go func() { err = sidecar.Run(context.Background(), cfg); close(done) }()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("Run() did not return")
	}
	if err == nil || !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("Run() = %v, want a start error", err)
	}
}

func waitFor(t *testing.T, file, want string) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for {
		got, _ := os.ReadFile(file)
		if string(got) == want {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("%s holds %q, want %q", file, got, want)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func TestCheck(t *testing.T) {
	status := http.StatusOK
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(status) }))
	defer srv.Close()
	if err := sidecar.Check(context.Background(), srv.Client(), srv.URL+"/api/auth/ok"); err != nil {
		t.Errorf("Check() = %v, want nil", err)
	}
	status = http.StatusBadGateway
	if err := sidecar.Check(context.Background(), srv.Client(), srv.URL+"/api/auth/ok"); err == nil {
		t.Error("Check() = nil on 502")
	}
	srv.Close()
	if err := sidecar.Check(context.Background(), srv.Client(), srv.URL+"/api/auth/ok"); err == nil {
		t.Error("Check() = nil with the sidecar down")
	}
}
