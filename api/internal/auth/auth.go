// Package auth resolves the signed-in user of a request from Better Auth's session cookie.
//
// Better Auth (the sidecar in web/server/) signs users in and owns the cookie. Go checks a session itself, without
// a call to the sidecar: it verifies the cookie's signature with the shared BETTER_AUTH_SECRET and looks the token
// up in the shared database's "session" table, joined with "user".
package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// CookieName is Better Auth's session cookie. Over HTTPS it carries the "__Secure-" prefix (SecureCookieName).
const (
	CookieName       = "better-auth.session_token"
	SecureCookieName = "__Secure-" + CookieName
)

// User is the signed-in user, as stored in Better Auth's "user" table.
type User struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Email         string    `json:"email"`
	EmailVerified bool      `json:"emailVerified"`
	Image         *string   `json:"image"`
	CreatedAt     time.Time `json:"createdAt"`
}

// Sessions looks sessions up in the database Better Auth writes to.
type Sessions struct {
	DB     *sql.DB
	Secret string
	// Now returns the current time; nil means time.Now.
	Now func() time.Time
}

// ErrNoSession means the request carries no valid, unexpired session.
var ErrNoSession = errors.New("no session")

// Token returns the session token from the request's session cookie after checking its signature. Better Auth
// signs the cookie as encodeURIComponent(token + "." + base64(HMAC-SHA256(secret, token))).
func Token(r *http.Request, secret string) (string, bool) {
	for _, name := range []string{SecureCookieName, CookieName} {
		c, err := r.Cookie(name)
		if err != nil || c.Value == "" {
			continue
		}
		if token, ok := verify(c.Value, secret); ok {
			return token, true
		}
	}
	return "", false
}

func verify(raw, secret string) (string, bool) {
	value, err := url.PathUnescape(raw)
	if err != nil {
		return "", false
	}
	dot := strings.LastIndexByte(value, '.')
	if dot < 1 {
		return "", false
	}
	token, sig := value[:dot], value[dot+1:]
	got, err := base64.StdEncoding.DecodeString(sig)
	if err != nil {
		return "", false
	}
	return token, hmac.Equal(got, Sign(token, secret))
}

// Sign returns the HMAC-SHA256 of value with secret, as Better Auth signs its cookies.
func Sign(value, secret string) []byte {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(value)) // a hash.Hash never returns an error
	return mac.Sum(nil)
}

// SignedCookieValue returns the cookie value Better Auth would set for token: for tests.
func SignedCookieValue(token, secret string) string {
	return url.QueryEscape(token + "." + base64.StdEncoding.EncodeToString(Sign(token, secret)))
}

// User returns the user of the request's session, or ErrNoSession.
func (s *Sessions) User(ctx context.Context, r *http.Request) (*User, error) {
	token, ok := Token(r, s.Secret)
	if !ok {
		return nil, ErrNoSession
	}
	var (
		u                    User
		verified             int
		expiresAt, createdAt string
	)
	err := s.DB.QueryRowContext(ctx, `
		SELECT s."expiresAt", u."id", u."name", u."email", u."emailVerified", u."image", u."createdAt"
		FROM "session" s JOIN "user" u ON u."id" = s."userId"
		WHERE s."token" = ?`, token).
		Scan(&expiresAt, &u.ID, &u.Name, &u.Email, &verified, &u.Image, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNoSession
	}
	if err != nil {
		return nil, fmt.Errorf("look up session: %w", err)
	}
	exp, err := parseTime(expiresAt)
	if err != nil {
		return nil, fmt.Errorf("session expiresAt %q: %w", expiresAt, err)
	}
	now := time.Now
	if s.Now != nil {
		now = s.Now
	}
	if !exp.After(now()) {
		return nil, ErrNoSession
	}
	u.EmailVerified = verified != 0
	if u.CreatedAt, err = parseTime(createdAt); err != nil {
		return nil, fmt.Errorf("user createdAt %q: %w", createdAt, err)
	}
	return &u, nil
}

// parseTime reads a date as Better Auth stores it in SQLite: an ISO 8601 string (Date.toISOString()).
func parseTime(s string) (time.Time, error) {
	return time.Parse(time.RFC3339Nano, s)
}

type ctxKey struct{}

// WithUser returns ctx carrying u.
func WithUser(ctx context.Context, u *User) context.Context {
	return context.WithValue(ctx, ctxKey{}, u)
}

// UserFrom returns the signed-in user that Middleware put in ctx, or nil.
func UserFrom(ctx context.Context) *User {
	u, _ := ctx.Value(ctxKey{}).(*User)
	return u
}

// Middleware resolves the request's session and puts its user in the request's context (UserFrom). It never
// rejects a request: RequireUser does that. A database error answers 500.
func (s *Sessions) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, err := s.User(r.Context(), r)
		switch {
		case err == nil:
			r = r.WithContext(WithUser(r.Context(), u))
		case !errors.Is(err, ErrNoSession):
			writeError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireUser answers 401 unless Middleware found a signed-in user.
func RequireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if UserFrom(r.Context()) == nil {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = fmt.Fprintf(w, "{\"error\":%q}\n", msg)
}
