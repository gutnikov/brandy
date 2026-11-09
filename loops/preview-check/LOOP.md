---
id: preview-check
title: "The PR's preview starts and the feature works on it before the user is called"
type: health-checks-smoke
status: proposed
trigger: [preview]
run: ./run
budget_seconds: 300
validation: cases
agents: []
hitl: [H3]
wiring: [.github/workflows/preview-check.yml on deployment_status (planned)]
---

# The PR's preview starts and the feature works on it before the user is called

## Requirement

The user's time is spent only on previews that work (pain `not-really-working`, setup 2026-11-09). Unit tests and
`verify` can be green while the preview does not start, the frontend cannot reach the API, or the feature breaks in a
real browser. The VPS is too small for a browser, so this check runs in CI against the preview itself (user, setup).

## Loop

1. Railway deploys the PR's environment and reports a GitHub deployment. Its `deployment_status: success` starts the
   workflow; the preview URL is in the event.
2. `run <url>`: poll `<url>/healthz` until 200 (up to 3 minutes), then run the Playwright suite against the URL:
   the smoke specs (the app loads, a user logs in, no console errors, no failed requests to the app's own origins),
   and the specs of the feature, tagged with the ticket key.
3. It uploads full-page screenshots of the built screens as an artifact, for gate 2.
4. Red: the job fails with the failing spec, its screenshot and the Railway deploy logs of the environment. The
   worker fixes it and pushes; Railway redeploys; the check runs again.
5. The job is a required check on main, so a PR with a broken preview cannot merge.

## Tools

Planned: Playwright in GitHub Actions (`npx playwright install --with-deps chromium`), Railway CLI with a project
token in GitHub secrets for the deploy logs. Versions are recorded when built.

## Signal

Planned: `preview-check: FAIL <spec> — <first error line>` plus the screenshot path, or
`preview-check: FAIL healthz — no 200 from <url>/healthz in 180 s; deploy logs: …`.

## Validation

Planned cases: must-fire — a preview whose `/healthz` never answers; a preview where a smoke spec fails (a page with
a console error). must-pass — a preview that answers and passes. Cases run against a local static server standing
in for the preview, so they need no Railway.

## Wiring

Planned: `.github/workflows/preview-check.yml` on `deployment_status`; required check on main.

Blocked on:
- H3: a Railway token, and Railway PR environments switched on for the project (with a `dev` environment as their
  base and a `proto` service for gate 1);
- the app skeleton: `/healthz`, a Playwright config that takes the base URL from the environment, a fixture that
  creates a user, and the first smoke spec. That is the skeleton ticket's work, not the harness's.
