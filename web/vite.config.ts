import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The Go API (api/, `go run .`) listens on 8080 by default; API_URL points the dev proxy elsewhere.
const api = process.env.API_URL ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/healthz': api,
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
  },
});
