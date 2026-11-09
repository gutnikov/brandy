// For component tests: the whole app (router, query client) on a memory history, with fetch answering for the
// auth API as the tests say.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { createAppRouter } from './router.tsx';

export interface FakeUser {
  name: string;
  email: string;
}

export function sessionFor(user: FakeUser) {
  const now = new Date().toISOString();
  return {
    session: { id: 's1', token: 't', userId: 'u1', expiresAt: now, createdAt: now, updatedAt: now },
    user: { id: 'u1', emailVerified: false, image: null, createdAt: now, updatedAt: now, ...user },
  };
}

type Handler = (body: Record<string, unknown>) => Response | Promise<Response>;

/**
 * Stubs fetch: get-session answers `signedIn` (changed by the handlers), the other paths answer with the
 * handler given for them, else 404. Returns the calls, as [path, body].
 */
export function fakeAuthApi(opts: { signedIn?: FakeUser | null; handlers?: Record<string, Handler> }) {
  const state = { signedIn: opts.signedIn ?? null };
  const calls: [string, Record<string, unknown>][] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(new URL(String(input), 'http://localhost'), init);
    const path = new URL(req.url).pathname;
    const text = await req.text();
    const body = (text ? JSON.parse(text) : {}) as Record<string, unknown>;
    calls.push([path, body]);
    if (path === '/api/auth/get-session') {
      return Response.json(state.signedIn ? sessionFor(state.signedIn) : null);
    }
    const handler = opts.handlers?.[path];
    return handler ? handler(body) : new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { state, calls };
}

export function apiError(status: number, code: string, message = code) {
  return Response.json({ code, message }, { status });
}

export function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router };
}
