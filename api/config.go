package main

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// DevSecret signs sessions when BETTER_AUTH_SECRET is not set, outside Railway only (see .env.example).
const DevSecret = "dev-only-secret-not-for-production-0123456789"

// Config is the app's settings, read from the environment (.env.example lists them).
type Config struct {
	Port    string
	DBPath  string
	WebDir  string
	Railway bool // running on Railway: RAILWAY_ENVIRONMENT (or _NAME, _ID) is set

	// Better Auth, shared by the sidecar and Go's session check.
	Secret         string
	BaseURL        string   // the app's public origin: BETTER_AUTH_URL, else https://$RAILWAY_PUBLIC_DOMAIN, else localhost
	TrustedOrigins []string // origins allowed to call /api/auth: BaseURL, and the dev servers locally

	// The sidecar: node runs AuthScript, listening on 127.0.0.1:AuthPort.
	AuthPort   string
	AuthScript string
}

// LoadConfig reads the settings from getenv. exists reports whether a file exists (to find the sidecar's script).
func LoadConfig(getenv func(string) string, exists func(string) bool) (Config, error) {
	env := func(key, fallback string) string {
		if v := getenv(key); v != "" {
			return v
		}
		return fallback
	}
	c := Config{
		Port:     env("PORT", "8080"),
		DBPath:   env("DATABASE_PATH", "./data/brandy.db"),
		WebDir:   env("WEB_DIR", "./web/dist"),
		AuthPort: env("AUTH_PORT", "8081"),
		Railway:  getenv("RAILWAY_ENVIRONMENT") != "" || getenv("RAILWAY_ENVIRONMENT_NAME") != "" || getenv("RAILWAY_ENVIRONMENT_ID") != "",
	}

	c.Secret = getenv("BETTER_AUTH_SECRET")
	if c.Secret == "" {
		if c.Railway {
			return c, errors.New("BETTER_AUTH_SECRET is not set: on Railway the app refuses to start without it " +
				"(generate one with: openssl rand -base64 32)")
		}
		c.Secret = DevSecret
	}

	switch {
	case getenv("BETTER_AUTH_URL") != "":
		c.BaseURL = getenv("BETTER_AUTH_URL")
	case getenv("RAILWAY_PUBLIC_DOMAIN") != "":
		c.BaseURL = "https://" + getenv("RAILWAY_PUBLIC_DOMAIN")
	case c.Railway:
		return c, errors.New("neither BETTER_AUTH_URL nor RAILWAY_PUBLIC_DOMAIN is set: give the service a public " +
			"domain on Railway, or set BETTER_AUTH_URL to the app's public URL")
	default:
		c.BaseURL = "http://localhost:" + c.Port
	}
	u, err := url.Parse(c.BaseURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return c, fmt.Errorf("the app's public URL %q is not an http(s) URL", c.BaseURL)
	}
	c.BaseURL = u.Scheme + "://" + u.Host
	c.TrustedOrigins = []string{c.BaseURL}
	if !c.Railway {
		for _, o := range []string{"http://localhost:5173", "http://localhost:" + c.Port} {
			if o != c.BaseURL {
				c.TrustedOrigins = append(c.TrustedOrigins, o)
			}
		}
	}

	c.AuthScript = getenv("AUTH_SIDECAR")
	if c.AuthScript == "" {
		// The TypeScript source, run by Node: from the repository root, or from api/ (go run .).
		for _, p := range []string{"web/server/main.ts", "../web/server/main.ts"} {
			if exists(p) {
				c.AuthScript = p
				break
			}
		}
		if c.AuthScript == "" {
			return c, errors.New("the auth sidecar was not found at web/server/main.ts or ../web/server/main.ts: " +
				"run from the repository root or api/, or set AUTH_SIDECAR")
		}
	}
	return c, nil
}

// SidecarCommand is the command line that runs the auth sidecar: the built JavaScript with node (the image), or
// the TypeScript source with web/'s tsx (development; not every Node build can strip types itself).
func (c Config) SidecarCommand() []string {
	if strings.HasSuffix(c.AuthScript, ".ts") {
		tsx := filepath.Join(filepath.Dir(c.AuthScript), "..", "node_modules", ".bin", "tsx")
		return []string{tsx, "--disable-warning=ExperimentalWarning", c.AuthScript}
	}
	return []string{"node", "--disable-warning=ExperimentalWarning", c.AuthScript}
}

// SidecarEnv is the sidecar's environment: the app's own, plus the settings it shares with Go.
func (c Config) SidecarEnv(base []string) ([]string, error) {
	dbPath, err := filepath.Abs(c.DBPath)
	if err != nil {
		return nil, err
	}
	return append(base,
		"BETTER_AUTH_SECRET="+c.Secret,
		"BETTER_AUTH_URL="+c.BaseURL,
		"BETTER_AUTH_TRUSTED_ORIGINS="+strings.Join(c.TrustedOrigins, ","),
		"DATABASE_PATH="+dbPath,
		"AUTH_PORT="+c.AuthPort,
	), nil
}

func fileExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}
