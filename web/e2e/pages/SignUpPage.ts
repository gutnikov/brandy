import { expect, type Locator, type Page } from '@playwright/test';

/** /sign-up: create an account (web/src/auth/SignUp.tsx). */
export class SignUpPage {
  private readonly heading: Locator;
  private readonly nameInput: Locator;
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  // Exact: while submitting the button reads "Creating account…".
  private readonly createAccountButton: Locator;
  // Shown in the email field's error when the email is taken.
  private readonly signInInsteadLink: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Create your account' });
    // Base UI's Field.Label is tied to its input, so the label names it. Exact, so that "Name" cannot match an
    // error or description text that contains the word.
    this.nameInput = page.getByLabel('Name', { exact: true });
    this.emailInput = page.getByLabel('Email', { exact: true });
    this.passwordInput = page.getByLabel('Password', { exact: true });
    this.createAccountButton = page.getByRole('button', { name: 'Create account', exact: true });
    this.signInInsteadLink = page.getByRole('link', { name: 'Sign in instead' });
  }

  async open() {
    await this.page.goto('/sign-up');
  }

  async signUp(user: { name: string; email: string; password: string }) {
    await this.nameInput.fill(user.name);
    await this.emailInput.fill(user.email);
    await this.passwordInput.fill(user.password);
    await this.createAccountButton.click();
  }

  async goToSignInInstead() {
    await this.signInInsteadLink.click();
  }

  async expectOpen() {
    await expect(this.heading).toBeVisible();
  }

  /** The field's error, which Base UI ties to the input as its accessible description. */
  async expectFieldError(field: 'name' | 'email' | 'password', text: string | RegExp) {
    const input = { name: this.nameInput, email: this.emailInput, password: this.passwordInput }[field];
    await expect(input).toHaveAccessibleDescription(text instanceof RegExp ? text : new RegExp(escape(text)));
  }
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
