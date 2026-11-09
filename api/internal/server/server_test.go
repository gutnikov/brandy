package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/gutnikov/brandy/api/internal/db"
)

func openDB(t *testing.T) *sql.DB {
	t.Helper()
	conn, err := db.Open(context.Background(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return conn
}

func newHandler(conn Pinger, web fstest.MapFS) http.Handler {
	cfg := Config{DB: conn, Logger: slog.New(slog.DiscardHandler)}
	if web != nil {
		cfg.Web = web
	}
	return New(cfg)
}

func get(t *testing.T, h http.Handler, path string) *http.Response {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec.Result()
}

func decode(t *testing.T, res *http.Response) map[string]string {
	t.Helper()
	if ct := res.Header.Get("Content-Type"); ct != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", ct)
	}
	var body map[string]string
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	return body
}

func TestHealthzOK(t *testing.T) {
	res := get(t, newHandler(openDB(t), nil), "/healthz")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}
	if body := decode(t, res); body["status"] != "ok" {
		t.Fatalf("body = %v, want status ok", body)
	}
}

func TestHealthzDatabaseDown(t *testing.T) {
	conn := openDB(t)
	if err := conn.Close(); err != nil {
		t.Fatal(err)
	}
	res := get(t, newHandler(conn, nil), "/healthz")
	if res.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", res.StatusCode)
	}
	if body := decode(t, res); body["status"] == "ok" {
		t.Fatalf("body = %v, must not say ok", body)
	}
}

func TestHello(t *testing.T) {
	res := get(t, newHandler(openDB(t), nil), "/api/hello")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.StatusCode)
	}
	if body := decode(t, res); body["message"] != "hello" {
		t.Fatalf("body = %v, want message hello", body)
	}
}

func TestWebApp(t *testing.T) {
	web := fstest.MapFS{
		"index.html":       {Data: []byte("<!doctype html><title>app</title>")},
		"assets/app-1.js":  {Data: []byte("console.log(1)")},
		"favicon.svg":      {Data: []byte("<svg/>")},
		"assets/empty/x.a": {Data: []byte("x")},
	}
	h := newHandler(openDB(t), web)

	for _, tc := range []struct {
		path, want string
		status     int
	}{
		{"/", "<title>app</title>", http.StatusOK},
		{"/index.html", "<title>app</title>", http.StatusOK},
		{"/some/client/route", "<title>app</title>", http.StatusOK},
		{"/assets/empty", "<title>app</title>", http.StatusOK}, // a directory falls back too
		{"/assets/app-1.js", "console.log(1)", http.StatusOK},
		{"/favicon.svg", "<svg/>", http.StatusOK},
	} {
		res := get(t, h, tc.path)
		body, _ := io.ReadAll(res.Body)
		if res.StatusCode != tc.status || !strings.Contains(string(body), tc.want) {
			t.Errorf("GET %s = %d %q, want %d containing %q", tc.path, res.StatusCode, body, tc.status, tc.want)
		}
	}

	// A path that climbs out of the web app's folder never leaves it. (The mux redirects such paths first; the
	// web app handler must be safe on its own.)
	res := get(t, spa(web), "/../../etc/passwd")
	if body, _ := io.ReadAll(res.Body); res.StatusCode != http.StatusOK || !strings.Contains(string(body), "<title>app</title>") {
		t.Fatalf("spa GET /../../etc/passwd = %d %q, want index.html", res.StatusCode, body)
	}

	// /api/* and /healthz stay the API, never the web app.
	res = get(t, h, "/api/nope")
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("GET /api/nope = %d, want 404", res.StatusCode)
	}
	if body := decode(t, res); body["error"] == "" {
		t.Fatalf("GET /api/nope body = %v, want an error", body)
	}
	if res := get(t, h, "/healthz"); res.StatusCode != http.StatusOK {
		t.Fatalf("GET /healthz = %d, want 200", res.StatusCode)
	}
}

func TestNoWebApp(t *testing.T) {
	if res := get(t, newHandler(openDB(t), nil), "/"); res.StatusCode != http.StatusNotFound {
		t.Fatalf("GET / without a web app = %d, want 404", res.StatusCode)
	}
}
