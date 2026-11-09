---
id: preview-gate
title: "The user tries the built feature on its preview before the merge"
type: result-demo
status: built
trigger: [task, preview]
run: none
budget_seconds: 0
validation: manual
agents: []
hitl: [H1]
wiring: [CLAUDE.md section Gate 2 (the preview)]
---

# The user tries the built feature on its preview before the merge

## Requirement

The user's second and last point in a ticket: try the built feature on its dev preview (setup, 2026-11-09:
"потыкать в dev-preview построенной фичи"). A merge to main goes to production on its own, so this is the last
moment someone who knows the intent sees the feature.

## Loop

1. The manager waits for the PR's checks: `verify` and `preview-check` green. The user is never called to a red or
   half-deployed preview.
2. If the PR changes nothing the user sees or does (backend only, refactoring, infrastructure), there is no gate: the
   manager merges and says on the ticket what changed, with the green checks.
3. Otherwise the manager sets the ticket to `in_review` and posts: the preview URL, a user to log in with, 3–5 steps
   from the ticket's acceptance criteria, and the built screens next to the approved prototype. It asks with
   AskUserQuestion: Merge / Something is wrong / Drop the ticket.
4. Something is wrong: each point becomes a failing e2e test first (`app-probing` reproduces it on the preview),
   then a fix; back to step 1. The user never has to catch the same bug twice.
5. Merge: the manager checks `gh pr checks <n>` again and merges with `gh pr merge <n> --squash --delete-branch`.
   Railway deploys main; `prod-guard` watches the deploy.

The call is H1: only the user can say whether the feature is what they meant.

## Tools

| Tool | Version | Where |
|---|---|---|
| `app-probing` skill (plugin `app-probing@private-plugins`) | 0.1.0 | installed on the bb VPS for root, 2026-11-09 |
| `gh` | logged in as gutnikov on the bb VPS | merges the PR |
| bb Tasks comments and AskUserQuestion | bb 0.48.1 | the user answers with a tap in the bb app |
| Railway PR environment and `preview-check` | — | not set up yet (Railway token, H3) |

## Signal

The user's answer in the manager thread; the ticket's status (`in_review`, then `done` after the merge) and its
comments are the record.

## Validation

Manual: the signal is a person's judgement. What is checked instead: on the first ticket with a user-visible change,
the user is called only after both checks are green, the message has the URL, a login, steps and screenshots, and
"Something is wrong" turns into a red e2e test before the fix. A backend-only ticket merges without a call. The loop
becomes `validated` after both are seen on real tickets.

## Wiring

`CLAUDE.md`, section "Gate 2: the preview".
