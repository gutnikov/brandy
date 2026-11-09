---
id: verify
title: "The project's build, vet, lint, type and test checks before a turn ends and before a merge"
type: stop-hook
status: active
trigger: [local, ci]
run: ./run
budget_seconds: 60
validation: cases
agents: []
hitl: []
wiring: [.claude/settings.json hooks.Stop -> loops/verify/stop-hook (light), .github/workflows/verify.yml job verify (full)]
---

# The project's build, vet, lint, type and test checks before a turn ends and before a merge

## Open

- **Main requires `verify` since 2026-11-09.** The repository was recreated public with a cleaned history (H2, the
  user's choice), and main is protected: the `verify` check is required, administrators included, no force pushes,
  no deletion. A worker can still edit the hook or the workflow in its branch, but a PR whose `verify` is red cannot
  merge, and nobody can push to main around it (a direct push was rejected, see Validation).
- **How long light mode takes on the VPS on the real app is unknown.** There is no app code yet. The times under
  Validation come only from the validation cases.

## Requirement

Tickets run on their own from start to merge, and the user sees only the UI prototype and the preview. So no code
that fails to build, vet, lint, type-check or pass its tests may leave the agent's turn or reach main. The user
chose this as the first failure to catch (pain `breaks-build`, and `conventions` through the linters; setup,
2026-11-09).

## Loop

1. A bb worker ends its turn. The Stop hook (`loops/verify/stop-hook`) looks at what the worktree changed against
   `origin/main`. If no product code changed, it lets the turn end. Changes under `loops/`, `.bb/`, `.claude/` and
   `.github/` do not count.
2. Otherwise it runs `loops/verify/run .` in light mode. `run` finds every Go module (`go.mod`) and every pnpm
   package (`package.json`; a pnpm workspace counts as one package, its root), and runs:
   - Go: `gofmt -l`, `go build -o /dev/null ./...`, `go vet ./...`, `go test -count=1 -vet=off ./...`, and `golangci-lint run`
     when a `.golangci.*` config exists. A failed build stops the module's checks.
   - web: first, the installed Node must satisfy the package's `engines.node` (brandy: `>=22`); then the package's
     scripts `typecheck`, `lint` and `test`; in full mode also `build`. A script the package does not have is skipped. Dependencies are installed first if `node_modules` is missing.

   `run` does not check:
   - `loops/` directly under the checked directory;
   - `node_modules`, `vendor`, `dist` and hidden directories, at any depth.
3. If a check fails, the hook blocks the end of the turn and the agent sees the failures with how to fix each one.
   It fixes them and tries to end the turn again. Claude Code lets a Stop hook block at most 8 times in a row; after
   that the turn ends with the failing code in place, and the hook tells no one. The failure then shows in CI on the
   PR, and the manager does not merge a PR whose `verify` is red.
4. The agent pushes. On a clean machine, GitHub Actions runs the same `run` in full mode. Full mode adds the web
   `build` script, and it requires `golangci-lint` when a `.golangci.*` config exists. The job `verify` is the check
   that main requires.

Light mode exists because the bb VPS has 1 vCPU and 889 MB of RAM: `vite build` and the browser checks run only in
CI (user, setup, 2026-11-09).

## Tools

| Tool | Version validated | Where, how installed |
|---|---|---|
| Python | 3.14.4 (VPS), 3.9.6 (Mac) | system; `run` needs only the standard library |
| Go (`go`, `gofmt`) | 1.26.5 | VPS: `/usr/local/go` from go.dev, linked into `/usr/local/bin` (2026-11-09); CI: `actions/setup-go@v6`, `1.26.x` |
| Node | 22 (VPS 22.22, CI `actions/setup-node@v5` 22) | `web/package.json` `engines.node >=22`; the Mac's default Node 20 fails the web tests (undici 8) |
| pnpm | 12.18.0 (VPS, Mac) | VPS and CI: `npm install -g pnpm@12` |
| golangci-lint | not used yet | CI installs v2 when a `.golangci.*` config appears; on the VPS it is skipped if missing |

`pnpm run` is called with `--config.verify-deps-before-run=false`: pnpm 12 otherwise installs before a run, and the
first run then prints different output from the next ones.

## Signal

These are the exit codes of `run`. Exit 0: passes. Exit 1: fires. Exit 2: cannot run because a tool is missing.
The Stop hook has its own exit code: it exits 2 to block the end of the turn whenever `run` exits non-zero, a
missing tool included.

On a failure, `run` prints one block per failed check: a header with the step, the module or package and how to fix
it, then up to 60 lines of the tool's own output, with durations and absolute paths replaced so that runs compare
equal.

```
verify: FAIL go test in . — how to fix: fix the code (or the test, only if the requirement changed); never delete or skip a failing test
--- FAIL: TestAdd (<t>)
    add_test.go:7: Add(2, 3) = -1, want 5
FAIL
FAIL	example.com/testfails	<t>
FAIL

verify: 1 check(s) failed. Rerun: loops/verify/run loops/verify/cases/must-fire/go-test-fails
```

## Validation

| Case | Stands for |
|---|---|
| must-fire/go-compile-error | Go code that does not compile; reported once, by `go build` |
| must-fire/go-vet | compiles, but `go vet` finds a bug (wrong `Printf` verb) |
| must-fire/go-test-fails | compiles, a unit test fails |
| must-fire/go-not-formatted | compiles and passes, but is not `gofmt`-formatted |
| must-fire/web-script-fails | a web package whose `typecheck` script fails (stands for `tsc`, `eslint` and the test runner: `run` checks the script's exit code, not the tool) |
| must-fire/web-node-too-old | a web package whose `engines.node` the installed Node does not meet: a clear "switch Node" message instead of a crash inside a dependency |
| must-pass/empty | no `go.mod` and no `package.json`: the repository at setup; the hook must not block anything |
| must-pass/go-ok | a Go module that builds, vets, is formatted and passes its tests |
| must-pass/web-ok | a web package whose scripts pass; its `build` script fails and must not run in light mode |
| must-pass/harness-cases-skipped | a broken Go module under a top-level `loops/`: the harness's own cases are not product code |

On 2026-11-09, `loops.py validate verify` on the Mac returned VALID: 9 cases, 3 runs each. Running the cases by hand
on the VPS gave the same results. On the VPS, each case took under 1 s with a warm Go cache. The first test compile
took 16 s (one measurement).

Wiring triggered for real on 2026-11-09:
- Stop hook in a scratch worktree of origin/main: no code changes → exit 0; a broken `api/main.go` → exit 2 with the
  `go build` failure and the fix hint; fixed → exit 0.
- CI in draft PR #2 (closed): the same broken `api/` → job `verify` red, with GitHub's annotation on
  `./main.go:4:14`; after the fix → green in 22 s (run 42605057360, "verify: OK (full mode; Go modules: api; web
  packages: none)").

## Wiring

- `.claude/settings.json` → `hooks.Stop`: `"$CLAUDE_PROJECT_DIR"/loops/verify/stop-hook`, timeout 900 s. bb threads
  load project settings (`--setting-sources=user,project,local`), so every manager and worker runs it. The manager
  does not change code, so for it the hook exits at once.
- `.github/workflows/verify.yml` → job `verify` on `pull_request` and on `push` to main; a newer push cancels the
  older run of the same ref. Main requires this job (branch protection, administrators included).
