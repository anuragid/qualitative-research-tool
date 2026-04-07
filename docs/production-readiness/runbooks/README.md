# Methodex runbooks

Step-by-step recipes for production incidents and routine operations. Each runbook has:

- **When to use it** — the symptom that triggers this runbook
- **Prerequisites** — tools, credentials, environment
- **Commands** — the exact sequence to run, with expected output
- **Verification** — how to confirm the fix worked
- **Escalation** — when to stop and ask for help

## Available runbooks

| File | When to use |
|---|---|
| `stuck-video.md` | A video is stuck in `analyzing` or `transcribing` state and not progressing |
| `deploy-interrupt-recovery.md` | A Railway deploy killed in-flight work; users report broken analyses |
| `redis-inspect.md` | You need to see Celery's queue depth, unacked tasks, or a specific stuck task |
| `db-snapshot.md` | You need to query production Postgres for a user's project/video state |
| `sentry-triage.md` | New Sentry issue — how to classify, prioritize, and fix |
| `railway-deploy.md` | How to apply the Railway service config (drainingSeconds, replicas, etc.) |
| `bootstrap-session.md` | Starting a fresh Claude session — what to load first |

## Principle

A runbook is a recipe, not a lesson. Every step should be copy-paste ready. If you find yourself writing "then figure out what's wrong", stop — that's a gap in the runbook, not a step. Replace it with the concrete commands or a pointer to the next runbook.
