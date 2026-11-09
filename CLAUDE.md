# brandy

Web SaaS. Backend: Go + SQLite. Frontend: React + TanStack + Vite + TypeScript + pnpm, Base UI (headless).
Hosting: Railway. Also in use: Cloudflare, PostHog. Styling comes later as separate work (the user, at setup): do
not add a theme or visual styling unless the ticket asks for it.

The bb setup of this repository is maintained by the bb agent; see `.bb/bb.yaml`. The agent loops (the checks the
agents run on their own work) are maintained by the harness agent; see `loops/` and `loops/index.yaml`.

## Where the agents run

bb runs every ticket's manager and workers on one small VPS: 1 vCPU, 889 MB RAM, 2 GB swap, a few GB of free disk.
Other threads and the bb server share it, and an out-of-memory kill takes them all down. On the VPS:

- Run builds, linters and unit tests only: `loops/verify/run .` and the commands it runs.
- Do not run a browser, Playwright, `docker build` or `docker run` there, and do not install system packages.
  Browser checks and image builds run in CI and on the Railway previews.
- Stop the dev servers you start, by PID, when you are done with them.

## How a ticket is delivered

Tickets run on their own from start to production. The user is called in at two points only: the UI prototype
(gate 1) and the preview of the built feature (gate 2). Everything else the agents decide and check themselves.

```
ticket ─► new or changed screen, flow or layout? ─yes─► gate 1: prototype approved ─┐
                                                 └no────────────────────────────────┤
          implement ─► verify (Stop hook) ─► PR ─► verify (CI) ─► preview ─► preview-check
          ─► user-visible change? ─yes─► gate 2: user accepts the preview ─┬► merge ─► production ─► prod-guard
                                  └no──────────────────────────────────────┘
```

Railway is not set up yet (as of 2026-11-09). There are no preview environments and no `proto` service, and the
loops `preview-check` and `prod-guard` are only specified, not running. Until they exist, follow the steps marked
"Until Railway is set up" in each gate.

If the user picks "Drop the ticket" at either gate, the manager sets the ticket to `canceled` and closes the PR.

### Gate 1: the UI prototype (loop `prototype-gate`)

When a ticket adds or changes a screen, a flow or a layout, the UI is approved as a prototype before it is built.
A change of text, a colour or a fix that keeps the layout skips the gate.

1. A worker makes the prototype with the `ui-prototypes` skill. The prototype must:
   - be one file, `web/prototypes/<ticket-key-lowercase>.tsx`, for example `web/prototypes/brn-12.tsx`
   - use only components from the design system
   - use data that breaks layouts: long names, big numbers, empty states

   `web/` is the planned name of the frontend folder; the skeleton ticket sets the real one. If it differs, use
   the real folder name.
2. The worker pushes the file on the ticket's branch and opens a draft PR.
3. The manager posts two things on the ticket:
   - the prototype's URL in the PR's preview environment: its `proto` service, `<proto url>/<name>`, where `<name>`
     is the file name without `.tsx`, for example `<proto url>/brn-12`
   - a screenshot of the prototype

   Until Railway is set up: the bb VPS has no browser, so there is no URL and no screenshot. Post the PR link and
   say that the preview is not available yet; the user can open the prototype locally with `pnpm proto`.
4. The manager asks the user with AskUserQuestion: "Approve", "Changes needed" (the user writes them), "Drop the
   ticket".
5. Changes needed: the worker revises the file, and the manager asks again and says what changed.
6. Approved: the manager comments `Prototype approved: <commit sha>` on the ticket. From then on the prototype is the
   reference for the feature. Before reporting DONE, the worker compares the built screen with it, and the manager
   shows both side by side at gate 2. A difference in layout is a defect unless the user asked for it at gate 2.

### Gate 2: the preview (loop `preview-gate`)

When the PR changes what the user sees or does in the app, the user tries it on the preview before the merge.

1. The manager waits until the PR's checks `verify` and `preview-check` are both green. The user is never called
   to a red or half-deployed preview.

   Until Railway is set up: wait only for `verify`.
2. The manager posts on the ticket:
   - the preview URL
   - a user to log in with
   - 3–5 steps for the user to try, taken from the ticket's acceptance criteria
   - screenshots of the built screens next to the approved prototype

   Until Railway is set up: post the PR link and what changed; there are no screenshots, because the bb VPS has no
   browser.
3. The manager sets the ticket to `in_review`.
4. The manager asks the user with AskUserQuestion: "Merge", "Something is wrong" (the user writes what), "Drop the
   ticket".
5. Something is wrong: the manager passes each point to a worker. For each point the worker first writes a failing
   e2e test, using the `app-probing` skill to reproduce the problem on the preview, and then fixes it. Then the
   manager goes back to step 1.
6. Merge: the manager checks `gh pr checks <n>` once more and merges with `gh pr merge <n> --squash
   --delete-branch`.

A PR with no user-visible change (backend only, refactoring, infrastructure) merges without gate 2, once its
checks are green; the manager says on the ticket what changed and links the green checks.

## Checks the agents run

- `loops/verify/run .` — build, vet, format, lint, type check and unit tests of every Go module and pnpm package.
  It runs as a Stop hook at the end of every turn that changed code (light mode) and in CI on every PR (full
  mode, job `verify`). Never merge a PR whose `verify` is not green, and never weaken a check, skip a test or
  delete one to get green.
- A red check is the worker's to fix. A worker that cannot get it green reports BLOCKED to the manager, with the
  failing output.
- `preview-check` and `prod-guard` are specified in `loops/preview-check/LOOP.md` and `loops/prod-guard/LOOP.md`
  but are not running yet.

## Commands

The API is the Go module in `api/` and the web app the pnpm package in `web/`. Settings come from the environment;
`.env.example` lists them with their defaults (`PORT=8080`, `DATABASE_PATH=./data/brandy.db`, `WEB_DIR=./web/dist`).

- First time: `cd web && pnpm install`, and `npx playwright install chromium` for the e2e tests.
- Run the app for development, in two terminals:
  - API: `cd api && go run .` on `:8080`. The database goes to `api/data/brandy.db`; migrations apply at start.
  - Web: `cd web && pnpm dev` on `http://localhost:5173`. Vite proxies `/api` and `/healthz` to `:8080`
    (`API_URL` points it elsewhere).
- Run it as in production, one process from the repository root: `(cd web && pnpm build) && go -C api build -o
  ../bin/brandy . && ./bin/brandy`, then open `http://localhost:8080`. Or the image:
  `docker build -t brandy . && docker run --rm -p 8080:8080 brandy`.
- Prototypes: `cd web && pnpm proto` on `http://localhost:6060/` (see `web/prototypes/README.md`).
- Tests:
  - everything CI checks: `loops/verify/run .` (light), `VERIFY_MODE=full loops/verify/run .` (adds `vite build`;
    golangci-lint when installed)
  - Go: `cd api && go test ./...`; lint: `golangci-lint run` (v2, config `api/.golangci.yml`)
  - web: `cd web && pnpm typecheck`, `pnpm lint`, `pnpm test` (Vitest, unit and component tests)
  - e2e: start the app, then `cd web && pnpm test:e2e` (Playwright, Chromium, specs in `web/e2e/`). It runs against
    `BASE_URL`, default `http://localhost:5173`; `BASE_URL=http://localhost:8080 pnpm test:e2e` for the built app.
- Migrations: add `api/internal/db/migrations/NNNN_name.sql` with the next number. Each applies once, in a
  transaction, recorded in `schema_migrations`.
