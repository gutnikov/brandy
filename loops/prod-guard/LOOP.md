---
id: prod-guard
title: "Production is checked after every deploy of main and rolled back when it is down"
type: health-checks-smoke
status: proposed
trigger: [production]
run: ./run
budget_seconds: 300
validation: cases
agents: []
hitl: [H3]
wiring: [.github/workflows/prod-guard.yml on deployment_status of production (planned)]
---

# Production is checked after every deploy of main and rolled back when it is down

## Requirement

A merge to main goes to production on its own (pain `escapes`, setup 2026-11-09). If a deploy takes production down,
nobody is watching: the user is called only at the prototype and the preview. The user allowed the agent to roll
production back on its own, but only when production is down (policy `autonomy.production_rollback`, 2026-11-09).

## Loop

1. Railway finishes the production deploy of main and reports a GitHub deployment; its `deployment_status` starts the
   workflow.
2. `run <url>`: poll `<url>/healthz` for up to 3 minutes.
   - No 200: production is down. Roll back to the previous deployment with the Railway CLI, check `/healthz` again,
     and open a GitHub issue "Production rolled back" with the commit, the deploy logs and the rollback's result.
     The bb manager of the ticket tells the user.
   - 200: run the production smoke specs (read-only: the app loads, login page works). A failure here does not roll
     back: production is up. It opens an issue and the user is told; the fix goes through a normal ticket.
3. Later, once PostHog is connected: compare the error rate of the 15 minutes after the deploy with the 15 before.

## Tools

Planned: Railway CLI with a project token in GitHub secrets (`RAILWAY_TOKEN`), Playwright for the read-only smoke,
`gh` in Actions for the issue. Versions are recorded when built.

## Signal

Planned: `prod-guard: DOWN <url>/healthz — rolled back to <deployment id>: healthz 200` or
`prod-guard: FAIL smoke <spec> — production up, not rolled back`.

## Validation

Planned cases against a local stand-in server: must-fire — `/healthz` never answers (expects the rollback command to
be called, with Railway replaced by a stub); smoke fails while `/healthz` answers (expects no rollback). must-pass —
healthy. Then one real run on the first production deploy.

## Wiring

Planned: `.github/workflows/prod-guard.yml` on `deployment_status` of the production environment. Railway's "Wait
for CI" on production, so main deploys only after `verify` is green.

Blocked on: H3, a Railway token; the app skeleton with `/healthz`; the first production deploy.
