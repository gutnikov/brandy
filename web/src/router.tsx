import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';
import { AppShell } from './AppShell.tsx';
import { safeRedirect, sessionQuery, validateAuthSearch } from './auth/client.ts';
import { SignIn } from './auth/SignIn.tsx';
import { SignUp } from './auth/SignUp.tsx';
import { Home } from './Home.tsx';
import { NotFound } from './NotFound.tsx';

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <Outlet />
    </div>
  ),
});

// /sign-in and /sign-up: a signed-in user goes straight on, to ?redirect= or the start page.
const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'auth',
  validateSearch: validateAuthSearch,
  beforeLoad: async ({ context, search }) => {
    if (await context.queryClient.query(sessionQuery)) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router's redirect is thrown
      throw redirect({ href: safeRedirect(search.redirect) });
    }
  },
  component: Outlet,
});

const signInRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/sign-in',
  component: function SignInPage() {
    return <SignIn search={signInRoute.useSearch()} />;
  },
});

const signUpRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/sign-up',
  component: function SignUpPage() {
    return <SignUp search={signUpRoute.useSearch()} />;
  },
});

// Everything else needs a signed-in user: a signed-out visitor goes to /sign-in, with ?redirect= back to the page
// they opened (none for the start page).
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context, location }) => {
    if (!(await context.queryClient.query(sessionQuery))) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router's redirect is thrown
      throw redirect({
        to: '/sign-in',
        search: location.href === '/' ? {} : { redirect: location.href },
      });
    }
  },
  component: AppShell,
});

const homeRoute = createRoute({ getParentRoute: () => appRoute, path: '/', component: Home });

const notFoundRoute = createRoute({ getParentRoute: () => appRoute, path: '$', component: NotFound });

const routeTree = rootRoute.addChildren([
  authRoute.addChildren([signInRoute, signUpRoute]),
  appRoute.addChildren([homeRoute, notFoundRoute]),
]);

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({ routeTree, context: { queryClient }, history });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
