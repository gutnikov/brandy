---
id: preview-check
title: "The PR's preview starts and the feature works on it before the user is called"
type: health-checks-smoke
status: active
trigger: [preview]
run: ./run
budget_seconds: 60
validation: cases
agents: []
hitl: []
wiring: [.github/workflows/preview-check.yml job preview-check on every PR]
---

# The PR's preview starts and the feature works on it before the user is called

## Requirement

The user's time is spent only on previews that work (pain `not-really-working`, setup 2026-11-09). Unit tests and
`verify` can be green while the preview does not start, the frontend cannot reach the API, or the feature breaks in a
real browser. The bb VPS is too small for a browser, so this check runs in CI against the preview itself (user,
setup).

## Loop

1. A PR is opened or updated. The job `preview-check` starts at once.
2. If the PR changes nothing under `api/`, `web/` or `Dockerfile` (the watch patterns of the Railway service `app`),
   Railway deploys no app preview: the job passes with `SKIP`.
3. Otherwise it waits, up to 20 minutes, for Railway's commit status `brandy - app` on the PR's head commit.
   - `failure`: the preview build or deploy failed. The job fails with Railway's log link, and
     `loops/preview-check/reproduce` builds and starts the image in the job (with the values of `.env.example` the
     Dockerfile does not set), so the error is in the job log, readable with `gh run view --log-failed`. If the
     image starts there, it says that a Railway variable is most likely missing.
   - `success`: it reads the app's URL from Railway's PR comment (fallback `https://app-brandy-pr-<N>.up.railway.app`).
4. `loops/preview-check/run <url>`: `/healthz` until 200 (3 minutes), then the Playwright suite in `web/e2e` against
   the URL: the smoke spec and every feature spec (only the specs matching `E2E_GREP` when it is set; prod-guard sets
   `@smoke`).
5. It saves a full-page screenshot of `/`, the Playwright report and traces as the artifact
   `preview-check-pr<N>`, for gate 2.

No Railway token is used: the job reads only GitHub (statuses, comments), so a PR branch holds no Railway secret.

## Tools

| Tool | Version validated | Where |
|---|---|---|
| Playwright (`@playwright/test`) | 1.65.0, Chromium headless shell 158 | `web/` devDependency; CI installs Chromium with `--with-deps`; on the Mac for validation |
| pnpm | 12.18.0 | CI: `npm install -g pnpm@12`; the Mac was upgraded from 12.6.0, which rejects `packageManager: pnpm@12` |
| Python | 3.9.6 (Mac), the runner's | `run` and `cases/stub_server.py`, standard library only |
| Railway | — | commit status `brandy - app` and the bot's PR comment, set up by the harness agent on 2026-11-09 |

## Signal

Exit 0: up and green. 1: up, but a spec failed. 3: down. 2: cannot run.

```
preview-check: FAIL e2e against <case> — how to fix: open the failing spec's trace in the playwright-report artifact (or reproduce with the app-probing skill), fix the app or the spec.
    Error: console errors
    …
    +   "Uncaught TypeError: x is undefined",
    …
  1 failed
    [chromium] › e2e/smoke.spec.ts:4:1 › / loads and shows the hello message from the API
```

```
preview-check: DOWN <case>/healthz gave no 200 in 5 s (last: 503). How to fix: read the deploy logs of this environment; the app must start and answer /healthz.
```

## Validation

Cases are directories that `cases/stub_server.py` serves on a local port, standing in for a deployed app: `/`
from the case's `index.html`, `/api/hello` like the API, and `/healthz` with the status in `healthz-status`.

| Case | Stands for |
|---|---|
| must-fire/down | the app never answers 200 on `/healthz`: exit 3 |
| must-fire/console-error | the page loads and shows the message, but throws in the console: exit 1 |
| must-fire/no-hello | the page loads but the feature is missing (no `hello-message`): exit 1 |
| must-pass/healthy | the page fetches `/api/hello` and shows it, no errors: exit 0 |

`loops.py validate preview-check`: VALID, 4 cases, 3 runs each (2026-11-09, on the Mac).

Wiring triggered for real on 2026-11-09:
- PR #6 (only `loops/` and `.github/`): `SKIP`, green.
- Scratch PR #7 (a comment in `web/src/Home.tsx`): Railway deployed `app-brandy-pr-7`; `preview-check: OK
  https://app-brandy-pr-7.up.railway.app (healthz 200, 1 specs passed)` in 45 s, screenshot in the artifact
  (run 42629891597). Then a commit that logs a console error: red, `Error: console errors` with the message
  (run 42630248355). PR closed unmerged.
- Scratch PR #13 (an app that needs a variable Railway lacks): the preview deploy failed at start; `reproduce`
  built and started the image with `.env.example`'s values and said a Railway variable is most likely missing
  (run 42654123342). PR closed unmerged.
- The first run on #7 found a deadlock: the PR environment inherited Railway's "Wait for CI", so the app waited for
  `preview-check` while `preview-check` waited for the app. "Wait for CI" is now off everywhere (see prod-guard).

## Wiring

`.github/workflows/preview-check.yml`, job `preview-check`, on every `pull_request`; a newer push cancels the older
run of the same PR. A required check on main since 2026-11-09 (with `verify`).
