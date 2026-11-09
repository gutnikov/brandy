---
id: prod-guard
title: "Production is checked after every deploy of main and rolled back when it is down"
type: health-checks-smoke
status: active
trigger: [production]
run: ./run
budget_seconds: 60
validation: cases
agents: []
hitl: []
wiring: [.github/workflows/prod-guard.yml on Railway's status 'brandy - app' for a main commit]
---

# Production is checked after every deploy of main and rolled back when it is down

## Requirement

A merge to main goes to production on its own (pain `escapes`, setup 2026-11-09). The user is called only at the
prototype and the preview, so nobody watches a deploy. The user allowed the agent to roll production back on its own,
but only when production is down (policy `autonomy.production_rollback`, 2026-11-09).

## Loop

1. A PR merges. Railway deploys the main commit and sets the commit status `brandy - app`: `success` with the
   production domain, or `failure`/`error`. Main only takes PRs that are up to date with it and whose `verify` is
   green, so the deployed tree is the tested one.
2. That status starts `prod-guard`. It ignores `pending`, statuses of PR environments, "No deployment needed" (the
   push did not touch the app) and "Deployment cancelled" (a newer commit replaced it).
3. `loops/prod-guard/run <production url>` runs `loops/preview-check/run` with `E2E_GREP=@smoke`: `/healthz` until 200,
   then only the specs tagged `@smoke`, which must only read.
   - Exit 3, down: `loops/prod-guard/railway.py rollback` rolls the service back to the last good deployment of an
     earlier commit, waits for `/healthz` again, and opens an issue "production was down …; rollback: <result>".
   - Exit 1, up but a smoke spec failed: an issue "smoke failed on production …", no rollback.
   - Railway reported a failed deploy but production answers: an issue "deploy … failed; production still runs the
     previous one".
4. The job fails whenever production is not fine, so the run is red in Actions. The user gets the issue from GitHub.

Why a status and not the push: Railway says when the deploy ended, so the job needs no Railway token to wait.
Railway's "Wait for CI" is off on purpose: with it, Railway waits for every check suite on the commit, and a job that
waits for the deploy (this one on main, `preview-check` on a PR) holds the deploy back for good. Seen on PR #7
(2026-11-09): the app waited "for status checks" while `preview-check` waited for the app. Requiring PRs to be up to
date with main (branch protection, strict) gives the same guarantee: what reaches main passed `verify` as is.

## Tools

| Tool | Version validated | Where |
|---|---|---|
| `loops/preview-check/run` | this repository | the health and e2e run, with `E2E_GREP=@smoke` |
| Railway GraphQL API (`deployments`, `deploymentRollback`) | — | `railway.py`, header `Project-Access-Token` |
| `RAILWAY_TOKEN` | created 2026-11-09 | a Railway project token for the production environment only, in the GitHub environment `production`, which only protected branches (main) can use. The user created it (the Railway CLI may not create tokens: "Not Authorized"); it went from the clipboard to the secret without being shown |

## Signal

Exit 0: production is fine. 1: up, a smoke spec failed. 3: down. 2: cannot run.

```
prod-guard: DOWN <case>/healthz gave no 200 in 5 s (last: 503). How to fix: read the deploy logs of this environment; the app must start and answer /healthz.
prod-guard: production is DOWN — roll back to the previous deployment, then tell the user.
```

## Validation

The same stand-in server as preview-check (`loops/preview-check/cases/stub_server.py`):

| Case | Stands for |
|---|---|
| must-fire/down | production never answers 200 on `/healthz`: exit 3, rollback |
| must-fire/console-error | production is up, a smoke spec fails: exit 1, no rollback |
| must-pass/healthy | production is fine: exit 0 |

`loops.py validate prod-guard`: VALID, 3 cases, 3 runs each (2026-11-09, on the Mac).

Wiring triggered for real on 2026-11-09:
- Merge of PR #8 (`91f4df3`): Railway deployed production and set `brandy - app: success`; the run started by that
  status (42631340298): `prod-guard: OK https://app-production-fd86.up.railway.app (healthz 200, 1 specs passed)`;
  `rollback` and `report` skipped. The four runs started by other statuses were skipped by the filter.
- `DRY_RUN=1 railway.py rollback` with the real production token: `rollback: 3a313459… (91f4df3) -> 699ff311…
  (997e86a)`, the last good deployment of an earlier commit, skipping deployments Railway skipped. The first dry run
  found a bug: Cloudflare in front of Railway's API answers 403 to Python's default user agent; `railway.py` now
  sends its own.
- Not run: a real rollback of production.

## Wiring

`.github/workflows/prod-guard.yml`, on `status`, three jobs:

- `check`: no environment and no secrets. It installs the web app (third-party npm code) and runs `run`.
- `rollback`: only when `check` says down; in the GitHub environment `production`; installs nothing; `RAILWAY_TOKEN`
  is given to the rollback step alone. Then it polls `/healthz` until production is back.
- `report`: the issue, with `GH_TOKEN` on that step alone; the run fails when production is not fine.

The specs tagged `@smoke` in `web/e2e` are the production smoke suite; `CLAUDE.md` says they must only read.
