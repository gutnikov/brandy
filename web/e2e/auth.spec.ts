// BRN-5: sign-up, sign-in, sign-out and the signed-out redirect, against a running app (a PR's preview in CI).
// Every test here signs a user up: none is @smoke, so none runs against production.
import { expect, freshCredentials, test } from './fixtures.ts';

test('sign-up lands in the app signed in', async ({ page, signUpPage, appShell }) => {
  const user = freshCredentials();
  await signUpPage.open();

  await signUpPage.signUp(user);

  await expect(page).toHaveURL('/');
  await appShell.expectSignedInAs(user);
  // The Go API checks the same session itself.
  const me = await page.request.get('/api/me');
  expect(me.status()).toBe(200);
  expect(await me.json()).toMatchObject({ name: user.name, email: user.email });
});

test('sign-up with a taken email offers to sign in', async ({ newUser, page, signUpPage, signInPage }) => {
  await signUpPage.open();

  await signUpPage.signUp({ ...newUser, password: 'another-password-123' });

  await signUpPage.expectFieldError('email', 'An account with this email already exists.');
  await signUpPage.goToSignInInstead();
  await expect(page).toHaveURL('/sign-in');
  await signInPage.expectOpen();
});

test('sign-in with the right password lands in the app', async ({ newUser, page, signInPage, appShell }) => {
  await signInPage.open();

  await signInPage.signIn(newUser);

  await expect(page).toHaveURL('/');
  await appShell.expectSignedInAs(newUser);
});

test('sign-in with a wrong password says so and clears the password', async ({ newUser, page, signInPage }) => {
  await signInPage.open();

  await signInPage.signIn({ email: newUser.email, password: 'not-the-password-123' });

  await signInPage.expectWrongCredentials();
  await signInPage.expectPasswordEmpty();
  await signInPage.expectEmail(newUser.email);
  await expect(page).toHaveURL('/sign-in');
});

test('sign-out ends the session and goes to /sign-in', async ({ signedInUser, page, appShell, signInPage }) => {
  await page.goto('/');
  await appShell.expectSignedInAs(signedInUser);
  await appShell.openAccountMenu();
  await appShell.expectAccountDetails(signedInUser);

  await appShell.signOut();

  await expect(page).toHaveURL('/sign-in');
  await signInPage.expectOpen();
  expect((await page.request.get('/api/me')).status()).toBe(401);
  await page.goto('/');
  await expect(page).toHaveURL('/sign-in');
});

test('a signed-out visitor of a deep link signs in and lands on that page', async ({
  newUser,
  page,
  signInPage,
  appShell,
}) => {
  const deepLink = '/projects/42/settings?tab=members';
  await page.goto(deepLink);
  await expect(page).toHaveURL(`/sign-in?redirect=${encodeURIComponent(deepLink)}`);

  await signInPage.signIn(newUser);

  await expect(page).toHaveURL(deepLink);
  await appShell.expectSignedInAs(newUser);
});
