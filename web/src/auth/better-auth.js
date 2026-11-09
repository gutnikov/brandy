// Better Auth's React client. JavaScript with its types in better-auth.d.ts: the app's type-checked program then
// does not load Better Auth's whole type graph, which ESLint's typed rules cannot afford on the bb VPS.
// server/auth-client-types.ts checks that better-auth.d.ts matches the real client.
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  // Looks fetch up on each call (better-fetch would keep the one it found at start), so tests can stub it.
  fetchOptions: { customFetchImpl: (input, init) => fetch(input, init) },
});
