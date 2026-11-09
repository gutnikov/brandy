import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Home } from './Home.tsx';

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Home />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Home', () => {
  it('shows the message from /api/hello', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ message: 'hello' })));
    vi.stubGlobal('fetch', fetchMock);

    renderHome();

    expect((await screen.findByTestId('hello-message')).textContent).toBe('hello');
    expect(fetchMock).toHaveBeenCalledWith('/api/hello');
  });

  it('says so when the API does not answer', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 503 }))));

    renderHome();

    expect((await screen.findByTestId('hello-error')).textContent).toContain('503');
  });
});
