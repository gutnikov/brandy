// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Prototypes are sketches, never linted (see prototypes/README.md).
  { ignores: ['dist', 'dist-server', 'prototypes', 'playwright-report', 'test-results'] },
  {
    files: ['**/*.{ts,tsx,js}'],
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  // server/ and e2e/ (with playwright.config.ts) are programs of their own, each with its tsconfig.json: naming it
  // keeps a file from loading a second program (lint.mjs says why the programs are split).
  {
    files: ['server/**/*.ts'],
    languageOptions: { parserOptions: { projectService: false, project: './server/tsconfig.json' } },
  },
  {
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    languageOptions: { parserOptions: { projectService: false, project: './e2e/tsconfig.json' } },
  },
  // The config file itself: typed linting would load all of typescript-eslint's types (out of memory on the VPS).
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
  {
    files: ['src/**/*.tsx'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
  },
);
