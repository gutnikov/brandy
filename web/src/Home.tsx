// Scratch: triggers a Railway app preview for the preview-check validation (PR closed unmerged).
import { useQuery } from '@tanstack/react-query';
import { fetchHello } from './api.ts';

export function Home() {
  console.error('scratch: a broken page for the preview-check red-path test');
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
