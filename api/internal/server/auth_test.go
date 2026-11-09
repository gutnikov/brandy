package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/gutnikov/brandy/api/internal/auth"
	"github.com/gutnikov/brandy/api/internal/db"
)

const testSecret = "test-secret-0123456789abcdef0123456789"

func TestMe(t *testing.T) {
	conn := openDB(t)
	if _, err := db.Migrate(context.Background(), conn, db.Migrations); err != nil {
		t.Fatal(err)
	}
	future := time.Now().Add(time.Hour).UTC().Format("2006-01-02T15:04:05.000Z")
	if _, err := conn.Exec(`INSERT INTO "user" VALUES ('u1','Anna','anna@example.com',1,NULL,'2026-11-09T10:00:00.000Z','2026-11-09T10:00:00.000Z');
		INSERT INTO "session" ("id","expiresAt","token","createdAt","updatedAt","userId")
		VALUES ('s1',?,'tok','2026-11-09T10:00:00.000Z','2026-11-09T10:00:00.000Z','u1')`, future); err != nil {
		t.Fatal(err)
	}
	h := New(Config{DB: conn, Logger: slog.New(slog.DiscardHandler), Sessions: &auth.Sessions{DB: conn, Secret: testSecret}})

	if res := get(t, h, "/api/me"); res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("GET /api/me signed out = %d, want 401", res.StatusCode)
	} else if body := decode(t, res); body["error"] == "" {
		t.Fatalf("GET /api/me signed out body = %v, want an error", body)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.AddCookie(&http.Cookie{Name: auth.SecureCookieName, Value: auth.SignedCookieValue("tok", testSecret)})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var me map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &me); err != nil || rec.Code != http.StatusOK {
		t.Fatalf("GET /api/me signed in = %d %s", rec.Code, rec.Body)
	}
	if me["id"] != "u1" || me["email"] != "anna@example.com" || me["name"] != "Anna" || me["emailVerified"] != true {
		t.Fatalf("GET /api/me = %v", me)
	}

	// Without a session store nobody is signed in.
	if res := get(t, newHandler(conn, nil), "/api/me"); res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("GET /api/me without Sessions = %d, want 401", res.StatusCode)
	}
}

func TestAuthProxy(t *testing.T) {
	var got *http.Request
	sidecar := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Clone(context.Background())
		http.SetCookie(w, &http.Cookie{Name: auth.CookieName, Value: "v"})
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	defer sidecar.Close()
	target, _ := url.Parse(sidecar.URL)
	log := slog.New(slog.DiscardHandler)
	h := New(Config{DB: openDB(t), Logger: log, Auth: AuthProxy(target, false, log)})

	req := httptest.NewRequest(http.MethodPost, "http://app.example/api/auth/sign-in/email?x=1", nil)
	req.RemoteAddr = "203.0.113.7:5555"
	req.Header.Set("X-Forwarded-For", "6.6.6.6") // spoofed by the client: ignored when not behind a proxy
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK || rec.Header().Get("Set-Cookie") == "" {
		t.Fatalf("proxied response = %d, Set-Cookie %q", rec.Code, rec.Header().Get("Set-Cookie"))
	}
	if got.Method != http.MethodPost || got.URL.Path != "/api/auth/sign-in/email" || got.URL.RawQuery != "x=1" {
		t.Fatalf("sidecar got %s %s", got.Method, got.URL)
	}
	if got.Host != "app.example" || got.Header.Get("X-Forwarded-For") != "203.0.113.7" {
		t.Fatalf("sidecar got Host %q, X-Forwarded-For %q", got.Host, got.Header.Get("X-Forwarded-For"))
	}

	sidecar.Close()
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/auth/get-session", nil))
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("sidecar down: %d, want 502", rec.Code)
	}

	if res := get(t, newHandler(openDB(t), nil), "/api/auth/get-session"); res.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("no sidecar configured: %d, want 503", res.StatusCode)
	}
}

func TestClientIP(t *testing.T) {
	for _, tc := range []struct {
		name        string
		behindProxy bool
		headers     map[string]string
		want        string
	}{
		{"direct", false, nil, "198.51.100.1"},
		{"direct ignores headers", false, map[string]string{"X-Real-IP": "6.6.6.6", "X-Forwarded-For": "6.6.6.6"}, "198.51.100.1"},
		{"proxy: X-Real-IP", true, map[string]string{"X-Real-IP": "203.0.113.9", "X-Forwarded-For": "6.6.6.6, 203.0.113.9"}, "203.0.113.9"},
		{"proxy: last X-Forwarded-For", true, map[string]string{"X-Forwarded-For": "6.6.6.6, 203.0.113.9"}, "203.0.113.9"},
		{"proxy: no headers", true, nil, "198.51.100.1"},
		{"proxy: junk", true, map[string]string{"X-Real-IP": "junk", "X-Forwarded-For": "junk"}, "198.51.100.1"},
	} {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.RemoteAddr = "198.51.100.1:1234"
		for k, v := range tc.headers {
			r.Header.Set(k, v)
		}
		if got := ClientIP(r, tc.behindProxy); got != tc.want {
			t.Errorf("%s: ClientIP() = %q, want %q", tc.name, got, tc.want)
		}
	}
}

func TestHealthzAuthDown(t *testing.T) {
	h := New(Config{DB: openDB(t), Logger: slog.New(slog.DiscardHandler),
		AuthCheck: func(context.Context) error { return errors.New("connection refused") }})
	res := get(t, h, "/healthz")
	if res.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", res.StatusCode)
	}
	if body := decode(t, res); body["failed"] != "auth" {
		t.Fatalf("body = %v, want failed: auth", body)
	}
}
