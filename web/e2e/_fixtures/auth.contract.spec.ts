// Contracts of the user fixtures in ../fixtures.ts: each checks the state the fixture promises, nothing more.
// They sign users up, so they are not @smoke (they never run against production).
import { expect, test } from '../fixtures.ts';

/** Contract: newUser's credentials sign in, and the page itself has no session. */
test('contract: newUser can sign in and the page is signed out', { tag: '@fixture-contract' }, async ({
  newUser,
  page,
  signInPage,
}) => {
  await page.goto('/');
  await signInPage.expectOpen();
  const res = await page.request.post('/api/auth/sign-in/email', {
    data: { email: newUser.email, password: newUser.password },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(res.status()).toBe(200);
});

/** Contract: with signedInUser the page opens the app signed in as that user. */
test('contract: signedInUser is signed in in the page', { tag: '@fixture-contract' }, async ({
  signedInUser,
  page,
  appShell,
}) => {
  await page.goto('/');
  await appShell.expectSignedInAs(signedInUser);
});
