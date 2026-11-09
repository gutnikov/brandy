// The sidecar's settings. The Go API (api/config.go) works them out and passes them in the environment when it
// starts the sidecar; the sidecar only checks that they are there.

export interface SidecarConfig {
  /** Signs the session cookie; Go checks the signature with the same secret. */
  secret: string;
  /** The app's public origin, for example https://app-production-fd86.up.railway.app. */
  baseURL: string;
  /** Origins that may call /api/auth: the base URL, and locally the Vite dev server. */
  trustedOrigins: string[];
  /** The SQLite file the Go API also uses. */
  databasePath: string;
  /** The port on 127.0.0.1 that the Go API proxies /api/auth/* to. */
  port: number;
}

export function readConfig(env: Record<string, string | undefined>): SidecarConfig {
  const missing = ['BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'DATABASE_PATH', 'AUTH_PORT'].filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(
      `auth sidecar: ${missing.join(', ')} not set. The Go API sets them when it starts the sidecar: run the API (cd api && go run .), not the sidecar alone.`,
    );
  }
  const port = Number(env.AUTH_PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`auth sidecar: AUTH_PORT ${String(env.AUTH_PORT)} is not a port`);
  }
  const baseURL = String(env.BETTER_AUTH_URL);
  const trusted = (env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    secret: String(env.BETTER_AUTH_SECRET),
    baseURL,
    trustedOrigins: [...new Set([baseURL, ...trusted])],
    databasePath: String(env.DATABASE_PATH),
    port,
  };
}
