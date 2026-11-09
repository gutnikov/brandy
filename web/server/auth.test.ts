// @vitest-environment node
// The sidecar's Better Auth on the Go migrations' schema: sign-up, sign-in and the session cookie the Go API reads.
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAuth } from './auth.ts';
import { migratedDatabase, testConfig } from './test-db.ts';

function setup() {
  const db = migratedDatabase();
  const auth = createAuth(testConfig, db);
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    auth.handler(
      new Request(`http://localhost:8080/api/auth${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:5173', ...headers },
        body: JSON.stringify(body),
      }),
    );
  return { db, auth, post };
}

function sessionCookie(res: Response): string {
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('better-auth.session_token='));
  if (!cookie) throw new Error(`no session cookie in ${JSON.stringify(res.headers.getSetCookie())}`);
  return cookie.split(';')[0] ?? '';
}

const anna = { name: 'Anna Schmidt', email: 'anna@example.com', password: 'correct-horse-battery' };

describe('the auth sidecar', () => {
  it('signs a new user up and in, with a session in the shared tables', async () => {
    const { db, auth, post } = setup();
    const res = await post('/sign-up/email', anna);
    expect(res.status).toBe(200);
    const cookie = sessionCookie(res);

    // The cookie is what Go checks (api/internal/auth): token.base64(HMAC-SHA256(secret, token)), URI-encoded.
    const [token, signature] = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)).split('.');
    expect(signature).toBe(createHmac('sha256', testConfig.secret).update(token ?? '').digest('base64'));
    const row = db.prepare('SELECT "expiresAt", "userId" FROM "session" WHERE "token" = ?').get(token ?? '');
    expect(row?.expiresAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user).toMatchObject({ name: anna.name, email: anna.email, emailVerified: false });
  });

  it('signs an existing user in, and refuses a wrong password without saying which field is wrong', async () => {
    const { post } = setup();
    await post('/sign-up/email', anna);

    const ok = await post('/sign-in/email', { email: anna.email, password: anna.password });
    expect(ok.status).toBe(200);
    sessionCookie(ok);

    for (const body of [
      { email: anna.email, password: 'wrong-password' },
      { email: 'nobody@example.com', password: anna.password },
    ]) {
      const res = await post('/sign-in/email', body);
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ code: 'INVALID_EMAIL_OR_PASSWORD' });
    }
  });

  it('refuses a taken email, a short password and an invalid email with codes the screens show', async () => {
    const { post } = setup();
    await post('/sign-up/email', anna);
    const cases: [unknown, string][] = [
      [anna, 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'],
      [{ ...anna, email: 'b@example.com', password: '1234567' }, 'PASSWORD_TOO_SHORT'],
      [{ ...anna, email: 'anna at example.com' }, 'VALIDATION_ERROR'],
    ];
    for (const [body, code] of cases) {
      const res = await post('/sign-up/email', body);
      expect(res.status, code).toBeGreaterThanOrEqual(400);
      const answer: unknown = await res.json();
      expect(answer).toMatchObject({ code });
    }
  });

  it('refuses a cookie-carrying request from an untrusted origin', async () => {
    const { post } = setup();
    const res = await post('/sign-up/email', anna, { origin: 'https://evil.example', cookie: 'x=1' });
    expect(res.status).toBe(403);
  });

  it('answers /ok, which the Go API health check calls', async () => {
    const { auth } = setup();
    const res = await auth.handler(new Request('http://localhost:8080/api/auth/ok'));
    expect(res.status).toBe(200);
  });
});
