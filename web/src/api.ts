// Calls to the Go API (api/). In dev, Vite proxies /api to it; in production the API serves this app itself.

export interface Hello {
  message: string;
}

export async function fetchHello(): Promise<Hello> {
  const res = await fetch('/api/hello');
  if (!res.ok) {
    throw new Error(`GET /api/hello: ${String(res.status)}`);
  }
  return (await res.json()) as Hello;
}
