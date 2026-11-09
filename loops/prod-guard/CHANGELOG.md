# prod-guard — changes

- 2026-11-09: proposed.
- 2026-11-09: spec written; blocked on the Railway token (H3) and the app skeleton.
- 2026-11-09: built: run (preview-check run with @smoke), railway.py rollback, workflow on Railway's status for main; 3 cases validated. Waiting for the production RAILWAY_TOKEN (H3).
- 2026-11-09: secrets out of reach of npm code (security review): check / rollback / report jobs; RAILWAY_TOKEN only on the rollback step.
