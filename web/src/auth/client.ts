// Auth for the screens. Better Auth's React client (better-auth.js) calls /api/auth/* on the app's own origin:
// the Go API proxies it to the auth sidecar (web/server/); in dev, Vite proxies /api to the Go API.
import { queryOptions } from '@tanstack/react-query';
import { authClient, type AuthSession } from './better-auth.js';

export { authClient };

export type Session = AuthSession;

/** The signed-in session, or null when signed out. The route guard and the account menu read it. */
export const sessionQuery = queryOptions({
  queryKey: ['session'],
  queryFn: async (): Promise<Session | null> => {
    const { data, error } = await authClient.getSession();
    if (error) {
      throw new Error(`GET /api/auth/get-session: ${String(error.status)} ${error.message ?? ''}`.trim());
    }
    return data;
  },
  staleTime: 60_000,
});

/** Better Auth's minimum password length (emailAndPassword.minPasswordLength in web/server/auth.ts). */
export const MIN_PASSWORD = 8;

/**
 * Where to go after signing in: the ?redirect= path if it is a path on this site, else the start page. Anything
 * else (another origin, //host, a scheme) is ignored, so that the parameter cannot send a user elsewhere.
 */
export function safeRedirect(redirect: string | undefined): string {
  if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//') || redirect.startsWith('/\\')) return '/';
  return redirect;
}

/** The search params /sign-in and /sign-up take. */
export interface AuthSearch {
  redirect?: string;
}

export function validateAuthSearch(search: Record<string, unknown>): AuthSearch {
  return typeof search.redirect === 'string' && search.redirect ? { redirect: search.redirect } : {};
}

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** The name the app shows for a user: Better Auth requires a name, but it can be blank; then the email. */
export function displayName(user: { name: string; email: string }): string {
  return user.name.trim() || user.email;
}

export function initials(user: { name: string; email: string }): string {
  return displayName(user)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
