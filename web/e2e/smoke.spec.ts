import { expect, test } from '@playwright/test';

// The app loads and talks to its API: run it against the Vite dev server or a deployed preview (BASE_URL).
test('/ loads and shows the hello message from the API', async ({ page, baseURL }) => {
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

  const res = await page.goto('/');
  expect(res?.ok()).toBe(true);
  await expect(page.getByTestId('hello-message')).toHaveText('hello');
  await page.waitForLoadState('networkidle');

  expect(consoleErrors, 'console errors').toEqual([]);
  expect(failedRequests, 'failed requests to the app').toEqual([]);
});
