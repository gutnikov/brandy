// Bundles the auth sidecar (server/main.ts and its dependencies) into one file, dist-server/main.mjs, so that the
// image runs it with plain node and needs no node_modules. pnpm build runs it after the web app's build.
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'server/main.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
    target: 'node22',
    copyPublicDir: false,
    rolldownOptions: { output: { entryFileNames: 'main.mjs', codeSplitting: false } },
  },
  ssr: { target: 'node', noExternal: true },
});
