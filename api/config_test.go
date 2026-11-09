package main

import (
	"slices"
	"strings"
	"testing"
)

func load(t *testing.T, vars map[string]string) (Config, error) {
	t.Helper()
	return LoadConfig(func(k string) string { return vars[k] }, func(p string) bool { return p == "../web/server/main.ts" })
}

func TestConfigLocalDefaults(t *testing.T) {
	c, err := load(t, nil)
	if err != nil {
		t.Fatal(err)
	}
	if c.Railway || c.Secret != DevSecret || c.BaseURL != "http://localhost:8080" || c.AuthPort != "8081" {
		t.Fatalf("config = %+v", c)
	}
	if want := []string{"http://localhost:8080", "http://localhost:5173"}; !slices.Equal(c.TrustedOrigins, want) {
		t.Fatalf("TrustedOrigins = %v, want %v", c.TrustedOrigins, want)
	}
	if c.AuthScript != "../web/server/main.ts" {
		t.Fatalf("AuthScript = %q", c.AuthScript)
	}
	if cmd := c.SidecarCommand(); cmd[0] != "../web/node_modules/.bin/tsx" || cmd[len(cmd)-1] != "../web/server/main.ts" {
		t.Fatalf("SidecarCommand() = %v, want web's tsx running the TypeScript source", cmd)
	}
}

func TestConfigOnRailway(t *testing.T) {
	railway := map[string]string{
		"RAILWAY_ENVIRONMENT_NAME": "brandy-pr-11",
		"RAILWAY_PUBLIC_DOMAIN":    "app-brandy-pr-11.up.railway.app",
		"BETTER_AUTH_SECRET":       "s3cret-from-railway-0123456789abcdef",
		"AUTH_SIDECAR":             "/app/auth/main.mjs",
		"PORT":                     "9999",
	}
	c, err := load(t, railway)
	if err != nil {
		t.Fatal(err)
	}
	if !c.Railway || c.Secret != railway["BETTER_AUTH_SECRET"] || c.BaseURL != "https://app-brandy-pr-11.up.railway.app" {
		t.Fatalf("config = %+v", c)
	}
	if !slices.Equal(c.TrustedOrigins, []string{"https://app-brandy-pr-11.up.railway.app"}) {
		t.Fatalf("TrustedOrigins = %v: no localhost on Railway", c.TrustedOrigins)
	}
	if cmd := c.SidecarCommand(); cmd[0] != "node" || cmd[len(cmd)-1] != "/app/auth/main.mjs" {
		t.Fatalf("SidecarCommand() = %v, want node running the built sidecar", cmd)
	}
	env, err := c.SidecarEnv([]string{"PATH=/bin"})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"BETTER_AUTH_SECRET=" + railway["BETTER_AUTH_SECRET"],
		"BETTER_AUTH_URL=https://app-brandy-pr-11.up.railway.app", "AUTH_PORT=8081", "PATH=/bin"} {
		if !slices.Contains(env, want) {
			t.Errorf("SidecarEnv() lacks %q: %v", want, env)
		}
	}

	delete(railway, "BETTER_AUTH_SECRET")
	if _, err := load(t, railway); err == nil || !strings.Contains(err.Error(), "BETTER_AUTH_SECRET") {
		t.Fatalf("on Railway without a secret: err = %v, want a refusal", err)
	}

	railway["BETTER_AUTH_SECRET"] = "x"
	delete(railway, "RAILWAY_PUBLIC_DOMAIN")
	if _, err := load(t, railway); err == nil {
		t.Fatal("on Railway without a public domain: no error")
	}
	railway["BETTER_AUTH_URL"] = "https://brandy.example/some/path"
	if c, err := load(t, railway); err != nil || c.BaseURL != "https://brandy.example" {
		t.Fatalf("BETTER_AUTH_URL: %+v, %v", c, err)
	}
}

func TestConfigErrors(t *testing.T) {
	if _, err := load(t, map[string]string{"BETTER_AUTH_URL": "ftp://x"}); err == nil {
		t.Error("a non-http BETTER_AUTH_URL: no error")
	}
	_, err := LoadConfig(func(string) string { return "" }, func(string) bool { return false })
	if err == nil || !strings.Contains(err.Error(), "AUTH_SIDECAR") {
		t.Errorf("no sidecar script: err = %v", err)
	}
}
