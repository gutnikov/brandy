package auth_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/gutnikov/brandy/api/internal/auth"
	"github.com/gutnikov/brandy/api/internal/db"
)

const secret = "dev-only-secret-change-me-0123456789abcdef"

// A cookie that Better Auth 1.7 itself set (better-call's serializeSignedCookie) for this token and secret.
const (
	vectorToken  = "Xb9TqP3kL0mN2vR8sW4yZ6aC1dE5fG7h"
	vectorCookie = "Xb9TqP3kL0mN2vR8sW4yZ6aC1dE5fG7h.HQbmUpndQh2O27RCjyHEnAsB3miJRpGXaCllzfM4Kq4%3D"
)

var now = time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)

func openDB(t *testing.T) *sql.DB {
	t.Helper()
	ctx := context.Background()
	conn, err := db.Open(ctx, filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	if _, err := db.Migrate(ctx, conn, db.Migrations); err != nil {
		t.Fatal(err)
	}
	return conn
}

// seed stores a user and a session the way Better Auth does: ids and tokens as text, dates as ISO strings.
func seed(t *testing.T, conn *sql.DB, token string, expiresAt time.Time) {
	t.Helper()
	iso := func(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }
	if _, err := conn.Exec(`INSERT INTO "user" ("id","name","email","emailVerified","image","createdAt","updatedAt")
		VALUES ('u1','Anna Schmidt','anna@example.com',0,NULL,?,?)`, iso(now.Add(-time.Hour)), iso(now)); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`INSERT INTO "session" ("id","expiresAt","token","createdAt","updatedAt","userId")
		VALUES ('s1',?,?,?,?,'u1')`, iso(expiresAt), token, iso(now), iso(now)); err != nil {
		t.Fatal(err)
	}
}

func request(cookieName, value string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	if cookieName != "" {
		r.AddCookie(&http.Cookie{Name: cookieName, Value: value})
	}
	return r
}

func TestTokenAcceptsBetterAuthsCookie(t *testing.T) {
	for _, name := range []string{auth.CookieName, auth.SecureCookieName} {
		got, ok := auth.Token(request(name, vectorCookie), secret)
		if !ok || got != vectorToken {
			t.Errorf("%s: Token() = %q, %v; want %q, true", name, got, ok, vectorToken)
		}
	}
	if got := auth.SignedCookieValue(vectorToken, secret); got != vectorCookie {
		t.Errorf("SignedCookieValue() = %q, want %q", got, vectorCookie)
	}
}

func TestTokenRejectsBadCookies(t *testing.T) {
	cases := map[string]*http.Request{
		"no cookie":        request("", ""),
		"other secret":     request(auth.CookieName, auth.SignedCookieValue(vectorToken, "another-secret")),
		"unsigned":         request(auth.CookieName, vectorToken),
		"forged token":     request(auth.CookieName, "other"+vectorCookie[len(vectorToken):]),
		"bad base64":       request(auth.CookieName, vectorToken+".!!!"),
		"bad escape":       request(auth.CookieName, vectorToken+".%zz"),
		"only a signature": request(auth.CookieName, "."+vectorCookie[len(vectorToken)+1:]),
	}
	for name, r := range cases {
		if got, ok := auth.Token(r, secret); ok {
			t.Errorf("%s: Token() = %q, true; want false", name, got)
		}
	}
}

func TestUser(t *testing.T) {
	conn := openDB(t)
	seed(t, conn, vectorToken, now.Add(time.Hour))
	s := &auth.Sessions{DB: conn, Secret: secret, Now: func() time.Time { return now }}

	u, err := s.User(context.Background(), request(auth.CookieName, vectorCookie))
	if err != nil {
		t.Fatal(err)
	}
	if u.ID != "u1" || u.Name != "Anna Schmidt" || u.Email != "anna@example.com" || u.EmailVerified || u.Image != nil {
		t.Errorf("User() = %+v", u)
	}
	if !u.CreatedAt.Equal(now.Add(-time.Hour)) {
		t.Errorf("CreatedAt = %v, want %v", u.CreatedAt, now.Add(-time.Hour))
	}

	if _, err := s.User(context.Background(), request(auth.CookieName, auth.SignedCookieValue("unknown", secret))); err != auth.ErrNoSession {
		t.Errorf("unknown token: err = %v, want ErrNoSession", err)
	}
	s.Now = func() time.Time { return now.Add(2 * time.Hour) }
	if _, err := s.User(context.Background(), request(auth.CookieName, vectorCookie)); err != auth.ErrNoSession {
		t.Errorf("expired session: err = %v, want ErrNoSession", err)
	}
}

func TestMiddlewareAndRequireUser(t *testing.T) {
	conn := openDB(t)
	seed(t, conn, vectorToken, now.Add(time.Hour))
	s := &auth.Sessions{DB: conn, Secret: secret, Now: func() time.Time { return now }}
	h := s.Middleware(auth.RequireUser(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(auth.UserFrom(r.Context()))
	})))

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, request(auth.SecureCookieName, vectorCookie))
	var u auth.User
	if rec.Code != http.StatusOK || json.Unmarshal(rec.Body.Bytes(), &u) != nil || u.Email != "anna@example.com" {
		t.Errorf("signed in: %d %s", rec.Code, rec.Body)
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, request("", ""))
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("signed out: status %d, want 401", rec.Code)
	}

	_ = conn.Close()
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, request(auth.CookieName, vectorCookie))
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("database down: status %d, want 500", rec.Code)
	}
}
