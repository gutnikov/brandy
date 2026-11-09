# verify — changes

- 2026-11-09: proposed.
- 2026-11-09: built and validated: 9 cases; Stop hook and CI triggered for real (draft PR #2, red then green).
- 2026-11-09: fix: go build wrote the binary of a main package into the checked directory (found in the fixtures); now -o /dev/null.
- 2026-11-09: active: on main, verify green on main (run 42606795032).
- 2026-11-09: repository recreated public with a cleaned history; main protected, verify required, admins included.
- 2026-11-09: Node check: the harness's own Stop hook failed on the Mac (Node 20: vitest could not load undici 8). web/package.json now asks for Node >=22, run says so before running the scripts, CI pins Node 22. New case must-fire/web-node-too-old.
