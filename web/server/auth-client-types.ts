// Compiles only if Better Auth's real React client fits the types the app uses for it
// (src/auth/better-auth.d.ts). It lives here, in the server's program, so that the app's program stays light.
import { createAuthClient } from 'better-auth/react';
import type { AuthClient } from '../src/auth/better-auth.js';

const realClient = createAuthClient({ fetchOptions: { customFetchImpl: (input, init) => fetch(input, init) } });

export const fitsTheAppsTypes: AuthClient = realClient;
