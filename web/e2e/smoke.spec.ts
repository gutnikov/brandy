import { expect, test } from './fixtures.ts';

// The app loads and talks to its API and its auth sidecar: run it against the Vite dev server or a deployed
// preview (BASE_URL). Tagged @smoke: it also runs against production after every deploy (loop prod-guard), so it
// must only read: it signs nobody up or in. A signed-out visitor of / lands on /sign-in.
test('/ sends a signed-out visitor to the sign-in screen, and auth answers', { tag: '@smoke' }, async ({
  page,
  baseURL,
  signInPage,
}) => {
  const origin = new URL(baseURL ?? page.url()).origin;
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  page.on('requestfailed', (req) => {
    if (new URL(req.url()).origin === origin) {
      failedRequests.push(`${req.method()} ${req.url()}: ${req.failure()?.errorText ?? 'failed'}`);
    }
  });
  page.on('response', (res) => {
    if (new URL(res.url()).origin === origin && res.status() >= 400) {
      failedRequests.push(`${res.request().method()} ${res.url()}: ${String(res.status())}`);
    }
  });

  // The app asks the auth sidecar (through the Go API) for the session: it must answer, with no session.
  const session = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/auth/get-session');
  const res = await page.goto('/');
  expect(res?.ok()).toBe(true);
  expect((await session).status()).toBe(200);
  await expect(page).toHaveURL('/sign-in');
  await signInPage.expectOpen();

  // The Go API's own session check: signed out.
  expect((await page.request.get('/api/me')).status()).toBe(401);

  expect(consoleErrors, 'console errors').toEqual([]);
  expect(failedRequests, 'failed requests to the app').toEqual([]);
});
