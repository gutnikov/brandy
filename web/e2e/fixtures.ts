// The e2e suite's fixtures: the Page Objects (pages/) and the users a test starts from. Specs import `test` and
// `expect` from here, not from @playwright/test.
import { test as base, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { AppShell } from './pages/AppShell.ts';
import { SignInPage } from './pages/SignInPage.ts';
import { SignUpPage } from './pages/SignUpPage.ts';

export { expect };

/** What a user signs in with. */
export interface Credentials {
  name: string;
  email: string;
  password: string;
}

/** A new user's credentials, unique per call: tests run in parallel and the preview's database is shared. */
export function freshCredentials(): Credentials {
  const id = randomUUID().slice(0, 8);
  return { name: `E2E User ${id}`, email: `e2e-${id}-${String(Date.now())}@example.com`, password: `pw-${randomUUID()}` };
}

// Better Auth rate-limits sign-up per client IP (30 a minute, web/server/auth.ts), and every test in a CI run
// comes from one IP. A 429 says how long to wait in X-Retry-After (seconds); the seed waits that long.
const MAX_RATE_LIMIT_RETRIES = 2;

/**
 * Creates an account through Better Auth's sign-up endpoint. The session cookie it answers with lands in
 * `request`'s cookie jar: the page's own (`context.request`) signs the page in, a separate one does not.
 */
async function seedUser(request: APIRequestContext, baseURL: string): Promise<Credentials> {
  const user = freshCredentials();
  for (let attempt = 0; ; attempt++) {
    const res = await request.post('/api/auth/sign-up/email', {
      data: user,
      // Better Auth checks the origin of requests that carry cookies; a browser would send this one.
      headers: { origin: new URL(baseURL).origin },
    });
    if (res.status() === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const seconds = Number(res.headers()['x-retry-after'] ?? '10');
      await new Promise((resolve) => setTimeout(resolve, Math.min(seconds, 60) * 1000));
      continue;
    }
    if (!res.ok()) {
      throw new Error(`seedUser: POST /api/auth/sign-up/email answered ${String(res.status())}: ${await res.text()}`);
    }
    return user;
  }
}

interface Fixtures {
  signUpPage: SignUpPage;
  signInPage: SignInPage;
  appShell: AppShell;
  newUser: Credentials;
  signedInUser: Credentials;
}

export const test = base.extend<Fixtures>({
  signUpPage: async ({ page }, use) => {
    await use(new SignUpPage(page));
  },
  signInPage: async ({ page }, use) => {
    await use(new SignInPage(page));
  },
  appShell: async ({ page }, use) => {
    await use(new AppShell(page));
  },

  /**
   * A fresh account (unique email, name, password), and a page that is signed out.
   *
   * For the tests of signing in: wrong password, sign-in, the signed-out redirect and the way back.
   * Seeded through Better Auth's sign-up API, in a request context of its own so that the page gets no session;
   * the sign-up form has a test of its own. Writes to the database: never in a @smoke spec.
   */
  newUser: async ({ playwright, baseURL }, use) => {
    const origin = baseURL ?? 'http://localhost:5173';
    const request = await playwright.request.newContext({ baseURL: origin });
    try {
      await use(await seedUser(request, origin));
    } finally {
      await request.dispose();
    }
  },

  /**
   * A fresh account whose session is in the page's browser context: the page is signed in.
   *
   * For tests that start inside the app, such as signing out. Seeded through the sign-up API with the context's
   * own request client, which shares the browser's cookies, so no form is walked. Writes: never in @smoke.
   */
  signedInUser: async ({ context, baseURL }, use) => {
    await use(await seedUser(context.request, baseURL ?? 'http://localhost:5173'));
  },
});
