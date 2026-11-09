---
id: prototype-gate
title: "The user approves the UI prototype before the UI is built"
type: plan-approval
status: built
trigger: [task]
run: none
budget_seconds: 0
validation: manual
agents: []
hitl: [H5]
wiring: [CLAUDE.md section Gate 1 (the UI prototype)]
---

# The user approves the UI prototype before the UI is built

## Requirement

The user wants to be called in when there is a UI prototype to work on and approve, and almost nowhere else (setup,
2026-11-09: "поработать над UI прототипом и одобрить его"). Without this gate the agent builds a screen nobody
agreed to, and the mismatch shows only on the preview, after the backend and the tests are done.

## Loop

1. The manager reads the ticket. If it adds or changes a screen, a flow or a layout, gate 1 applies. A change of
   text, a colour, or a fix that keeps the layout, skips it.
2. A worker writes the prototype with the `ui-prototypes` skill: `web/prototypes/<ticket-key-lowercase>.tsx`, built
   only from the design system, with data that breaks layouts. It pushes it on the ticket's branch and opens a draft
   PR.
3. The PR's preview environment serves it through its `proto` service. The manager posts the URL and a screenshot on
   the ticket and asks the user with AskUserQuestion: Approve / Changes needed / Drop the ticket.
4. Changes needed: the worker revises the file; the manager asks again and says what changed.
5. Approved: the manager comments `Prototype approved: <commit sha>`. The prototype becomes the reference for the
   feature: `preview-check` takes screenshots of the built screen, and the manager shows them next to the prototype
   at gate 2.

The answer is a person's judgement of intent and taste; no check can stand in for it. The call is H5: the user
approves a reference that the later checks and gate 2 compare against.

## Tools

| Tool | Version | Where |
|---|---|---|
| `ui-prototypes` skill (plugin `ui-prototypes@private-plugins`) | 0.1.0 | installed on the bb VPS for root, 2026-11-09 |
| bb Tasks comments and AskUserQuestion in the manager thread | bb 0.48.1 | the user answers with a tap in the bb app |
| Railway PR environment, service `proto` | — | not set up yet: comes with `preview-check` (Railway token, H3) |

Until the Railway preview exists there is no URL and no screenshot: the bb VPS has no browser. The manager posts the
PR link and says the preview is not available yet; the user can open the prototype locally with `pnpm proto`.

## Signal

The user's answer in the manager thread, and the ticket comment `Prototype approved: <commit sha>` that records it.
The ticket comments are the record; these calls are not copied to `loops/hitl-log.jsonl`.

## Validation

Manual: the signal is a person's judgement, so there are no cases. What is checked instead: the first ticket that
changes UI goes through the gate (prototype file, URL or screenshot on the ticket, the question, the approval
comment), and a ticket that only changes the backend does not. The loop becomes `validated` after both are seen on
real tickets.

## Wiring

`CLAUDE.md`, section "Gate 1: the UI prototype". bb managers and workers run in the repository and load it. The bb
Manager preset (`$bb/manager.md`) is not changed: it already asks the user with AskUserQuestion and owns the ticket.
