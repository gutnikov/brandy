import { useQuery } from '@tanstack/react-query';
import { fetchHello } from './api.ts';

export function Home() {
  const hello = useQuery({ queryKey: ['hello'], queryFn: fetchHello });

  return (
    <main>
      <h1>brandy</h1>
      {hello.isPending && <p data-testid="hello-loading">Loading…</p>}
      {hello.isError && <p data-testid="hello-error">Could not reach the API: {hello.error.message}</p>}
      {hello.isSuccess && <p data-testid="hello-message">{hello.data.message}</p>}
    </main>
  );
}
