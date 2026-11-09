import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, fakeAuthApi, renderApp, sessionFor } from '../test-app.tsx';

const anna = { name: 'Anna Schmidt', email: 'anna@example.com' };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function submit(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

async function location(router: ReturnType<typeof renderApp>['router'], href: string) {
  await waitFor(() => {
    expect(router.state.location.href).toBe(href);
  });
}

describe('sign-up', () => {
  it('says what is missing and sends nothing', async () => {
    const { calls } = fakeAuthApi({});
    renderApp('/sign-up');
    await screen.findByRole('heading', { name: 'Create your account' });

    submit('Create account');

    expect(await screen.findByText('Enter your name.')).toBeTruthy();
    expect(screen.getByText('Enter your email.')).toBeTruthy();
    expect(screen.getByText('Enter a password.')).toBeTruthy();
    expect(calls.filter(([p]) => p === '/api/auth/sign-up/email')).toEqual([]);
  });

  it('checks the email and the password length before sending', async () => {
    fakeAuthApi({});
    renderApp('/sign-up');
    await screen.findByRole('heading', { name: 'Create your account' });
    fill('Name', 'Anna');
    fill('Email', 'anna at example.com');
    fill('Password', '1234567');

    submit('Create account');

    expect(await screen.findByText('Enter an email address like name@example.com.')).toBeTruthy();
    expect(screen.getByText('Use at least 8 characters.')).toBeTruthy();
  });

  it('creates the account and lands signed in on the start page', async () => {
    const api = fakeAuthApi({
      handlers: {
        '/api/auth/sign-up/email': (body) => {
          api.state.signedIn = { name: String(body.name), email: String(body.email) };
          return Response.json(sessionFor(api.state.signedIn));
        },
      },
    });
    const { router } = renderApp('/sign-up');
    await screen.findByRole('heading', { name: 'Create your account' });
    fill('Name', '  Anna Schmidt ');
    fill('Email', 'anna@example.com');
    fill('Password', 'correct-horse-battery');

    submit('Create account');

    await location(router, '/');
    expect(await screen.findByTestId('account-menu')).toHaveProperty('textContent', 'ASAnna Schmidt▾');
    expect(api.calls).toContainEqual([
      '/api/auth/sign-up/email',
      { name: 'Anna Schmidt', email: 'anna@example.com', password: 'correct-horse-battery' },
    ]);
  });

  it('disables the form while Better Auth answers', async () => {
    fakeAuthApi({ handlers: { '/api/auth/sign-up/email': () => new Promise<Response>(() => undefined) } });
    renderApp('/sign-up');
    await screen.findByRole('heading', { name: 'Create your account' });
    fill('Name', 'Anna');
    fill('Email', 'anna@example.com');
    fill('Password', 'correct-horse-battery');

    submit('Create account');

    const button = await screen.findByRole('button', { name: 'Creating account…' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByLabelText('Email')).toHaveProperty('disabled', true);
  });

  it('offers to sign in when the email is taken', async () => {
    fakeAuthApi({
      handlers: { '/api/auth/sign-up/email': () => apiError(422, 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') },
    });
    renderApp('/sign-up?redirect=%2Fprojects');
    await screen.findByRole('heading', { name: 'Create your account' });
    fill('Name', 'Anna');
    fill('Email', 'anna@example.com');
    fill('Password', 'correct-horse-battery');

    submit('Create account');

    expect(await screen.findByText(/An account with this email already exists/)).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Sign in instead' });
    expect(link.getAttribute('href')).toBe('/sign-in?redirect=%2Fprojects');
  });

  it('keeps what was typed when the server fails', async () => {
    fakeAuthApi({ handlers: { '/api/auth/sign-up/email': () => apiError(500, 'INTERNAL_SERVER_ERROR') } });
    renderApp('/sign-up');
    await screen.findByRole('heading', { name: 'Create your account' });
    fill('Name', 'Anna');
    fill('Email', 'anna@example.com');
    fill('Password', 'correct-horse-battery');

    submit('Create account');

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Something went wrong on our side and the account was not created. Please try again.',
    );
    expect(screen.getByLabelText('Email')).toHaveProperty('value', 'anna@example.com');
    expect(screen.getByLabelText('Password')).toHaveProperty('value', 'correct-horse-battery');
  });
});

describe('sign-in', () => {
  it('says a wrong email or password is incorrect and clears the password', async () => {
    fakeAuthApi({
      handlers: { '/api/auth/sign-in/email': () => apiError(401, 'INVALID_EMAIL_OR_PASSWORD') },
    });
    renderApp('/sign-in');
    await screen.findByRole('heading', { name: 'Sign in to brandy' });
    fill('Email', 'anna@example.com');
    fill('Password', 'wrong-password');

    submit('Sign in');

    expect((await screen.findByRole('alert')).textContent).toBe('Email or password is incorrect.');
    expect(screen.getByLabelText('Email')).toHaveProperty('value', 'anna@example.com');
    expect(screen.getByLabelText('Password')).toHaveProperty('value', '');
  });

  it('goes back to the page from ?redirect= after signing in', async () => {
    const api = fakeAuthApi({
      handlers: {
        '/api/auth/sign-in/email': () => {
          api.state.signedIn = anna;
          return Response.json(sessionFor(anna));
        },
      },
    });
    const { router } = renderApp('/sign-in?redirect=%2Fprojects%2F42%3Ftab%3D2');
    await screen.findByRole('heading', { name: 'Sign in to brandy' });
    fill('Email', 'anna@example.com');
    fill('Password', 'correct-horse-battery');

    submit('Sign in');

    await location(router, '/projects/42?tab=2');
    expect(await screen.findByTestId('account-menu')).toBeTruthy();
  });

  it('ignores a ?redirect= to another site', async () => {
    const api = fakeAuthApi({
      handlers: {
        '/api/auth/sign-in/email': () => {
          api.state.signedIn = anna;
          return Response.json(sessionFor(anna));
        },
      },
    });
    const { router } = renderApp('/sign-in?redirect=%2F%2Fevil.example%2Fx');
    await screen.findByRole('heading', { name: 'Sign in to brandy' });
    fill('Email', 'anna@example.com');
    fill('Password', 'correct-horse-battery');

    submit('Sign in');

    await location(router, '/');
  });
});

describe('the route guard and the shell', () => {
  it('sends a signed-out visitor of / to /sign-in', async () => {
    fakeAuthApi({});
    const { router } = renderApp('/');
    await location(router, '/sign-in');
    expect(await screen.findByRole('heading', { name: 'Sign in to brandy' })).toBeTruthy();
  });

  it('sends a signed-out visitor of a deep link to /sign-in with the way back', async () => {
    fakeAuthApi({});
    const { router } = renderApp('/projects/42/settings');
    await location(router, '/sign-in?redirect=%2Fprojects%2F42%2Fsettings');
  });

  it('sends a signed-in user away from /sign-in', async () => {
    fakeAuthApi({ signedIn: anna });
    const { router } = renderApp('/sign-in');
    await location(router, '/');
  });

  it('shows the account and signs out to /sign-in', async () => {
    const api = fakeAuthApi({
      signedIn: anna,
      handlers: {
        '/api/auth/sign-out': () => {
          api.state.signedIn = null;
          return Response.json({ success: true });
        },
      },
    });
    const { router } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'brandy' })).toBeTruthy();

    fireEvent.click(screen.getByTestId('account-menu'));
    const details = await screen.findByTestId('account-details');
    expect(within(details).getByText('Anna Schmidt')).toBeTruthy();
    expect(within(details).getByText('anna@example.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));

    await location(router, '/sign-in');
    expect(api.calls.map(([p]) => p)).toContain('/api/auth/sign-out');
  });

  it('shows the email in place of a blank name', async () => {
    fakeAuthApi({ signedIn: { name: ' ', email: 'li@x.io' } });
    renderApp('/');
    expect(await screen.findByTestId('account-menu')).toHaveProperty('textContent', 'Lli@x.io▾');
  });
});
