import { expect, type Locator, type Page } from '@playwright/test';

/** The signed-in app's frame: the header with the account menu (web/src/AppShell.tsx). */
export class AppShell {
  private readonly accountMenuButton: Locator;
  // The menu renders in a portal outside the header: these start from the page.
  private readonly accountDetails: Locator;
  private readonly signOutItem: Locator;

  constructor(page: Page) {
    this.accountMenuButton = page.getByTestId('account-menu');
    this.accountDetails = page.getByTestId('account-details');
    this.signOutItem = page.getByRole('menuitem', { name: 'Sign out' });
  }

  async openAccountMenu() {
    // Click once, then poll: a second click would close a menu that a slow first click opened.
    await expect(async () => {
      if (!(await this.accountDetails.isVisible())) await this.accountMenuButton.click();
      await expect(this.accountDetails).toBeVisible({ timeout: 3_000 });
    }).toPass();
  }

  async signOut() {
    await this.openAccountMenu();
    await this.signOutItem.click();
  }

  /** Signed in as this user: the menu button shows the name (or the email for a blank name). */
  async expectSignedInAs(user: { name: string; email: string }) {
    await expect(this.accountMenuButton).toContainText(user.name.trim() || user.email);
  }

  async expectAccountDetails(user: { name: string; email: string }) {
    await expect(this.accountDetails).toContainText(user.email);
    if (user.name.trim()) await expect(this.accountDetails).toContainText(user.name);
  }
}
