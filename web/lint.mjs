// pnpm lint: ESLint over the whole package, one group of files per process.
//
// Typed linting holds a whole TypeScript program in memory, and Node gives ESLint about 450 MB of heap on the bb VPS
// (889 MB of RAM). The app, its tests, the auth sidecar (server/) and the e2e suite together need more than that,
// so each group runs in its own ESLint process. The groups cover every file the config lints; the rules are the same.
import { spawnSync } from 'node:child_process';

const tests = ['src/**/*.test.tsx', 'src/test-app.tsx'];
const others = ['server/**', 'e2e/**', 'playwright.config.ts', ...tests];

const groups = [
  ['the app', [...others.flatMap((p) => ['--ignore-pattern', p]), '.']],
  ['the app tests', tests],
  ['the auth sidecar', ['server']],
  ['the e2e suite', ['e2e', 'playwright.config.ts']],
];

for (const [name, args] of groups) {
  const run = spawnSync('eslint', args, { stdio: 'inherit' });
  if (run.status !== 0) {
    console.error(`lint: ESLint failed on ${name} (eslint ${args.join(' ')})`);
    process.exit(run.status ?? 1);
  }
}
