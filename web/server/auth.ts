// Better Auth's configuration: email and password only (no email verification, no password reset, no social
// logins), on the SQLite database the Go API shares, through Node's built-in node:sqlite (no native module).
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { DatabaseSync } from 'node:sqlite';
import type { SidecarConfig } from './config.ts';

/** Opens the shared database the way the Go API does: WAL, a busy timeout, foreign keys on. */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  return db;
}

// Sign-in and sign-up per client IP (the Go API passes it in X-Forwarded-For): Better Auth's default is 3 in 10
// seconds; 10 a minute is as strict against guessing and lets the e2e suite, from one CI machine, through.
const authRateLimit = { window: 60, max: 10 };

export function authOptions(config: Omit<SidecarConfig, 'port' | 'databasePath'>, database: DatabaseSync) {
  return {
    appName: 'brandy',
    secret: config.secret,
    baseURL: config.baseURL,
    basePath: '/api/auth',
    trustedOrigins: config.trustedOrigins,
    database,
    emailAndPassword: { enabled: true, autoSignIn: true, minPasswordLength: 8 },
    rateLimit: {
      customRules: { '/sign-in/email': authRateLimit, '/sign-up/email': authRateLimit },
    },
    // Explicit, so that tests (where Better Auth skips it by default) check the same as production.
    advanced: { disableOriginCheck: false },
    telemetry: { enabled: false },
  } satisfies BetterAuthOptions;
}

export function createAuth(config: Omit<SidecarConfig, 'port' | 'databasePath'>, database: DatabaseSync) {
  return betterAuth(authOptions(config, database));
}

/**
 * The tables Better Auth would still create or change in this database. Empty when the Go migration
 * (api/internal/db/migrations/0002_better_auth.sql) matches what Better Auth expects.
 */
export async function schemaDrift(options: BetterAuthOptions): Promise<string[]> {
  const { toBeCreated, toBeAdded } = await getMigrations(options);
  return [
    ...toBeCreated.map((t) => `missing table ${t.table}`),
    ...toBeAdded.map((t) => `table ${t.table} lacks ${Object.keys(t.fields).join(', ')}`),
  ];
}
