import { expect, type Locator, type Page } from '@playwright/test';

/** /sign-in, with an optional ?redirect= back to the page a signed-out visitor opened (web/src/auth/SignIn.tsx). */
export class SignInPage {
  private readonly heading: Locator;
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  // Exact: while submitting the button reads "Signing in…".
  private readonly signInButton: Locator;
  // The form's own alert (wrong email or password); scoped to the form so nothing else on the page can match.
  private readonly formAlert: Locator;
  private readonly createAccountLink: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Sign in to brandy' });
    this.emailInput = page.getByLabel('Email', { exact: true });
    this.passwordInput = page.getByLabel('Password', { exact: true });
    this.signInButton = page.getByRole('button', { name: 'Sign in', exact: true });
    this.formAlert = page.getByTestId('sign-in-form').getByRole('alert');
    this.createAccountLink = page.getByRole('link', { name: 'Create an account' });
  }

  async open() {
    await this.page.goto('/sign-in');
  }

  async signIn(credentials: { email: string; password: string }) {
    await this.emailInput.fill(credentials.email);
    await this.passwordInput.fill(credentials.password);
    await this.signInButton.click();
  }

  async goToCreateAccount() {
    await this.createAccountLink.click();
  }

  async expectOpen() {
    await expect(this.heading).toBeVisible();
  }

  async expectWrongCredentials() {
    await expect(this.formAlert).toHaveText('Email or password is incorrect.');
  }

  async expectPasswordEmpty() {
    await expect(this.passwordInput).toHaveValue('');
  }

  async expectEmail(email: string) {
    await expect(this.emailInput).toHaveValue(email);
  }
}
