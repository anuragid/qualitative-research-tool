# Runbook: Deploy interrupt recovery

## When to use

A Railway deploy just happened (rolling restart of backend/worker/beat) and you're worried about in-flight Celery chain steps. Users may or may not be reporting problems yet. Use this runbook to verify the system recovered cleanly, and if it didn't, to unstick affected videos.

## Background

After PR #19 (Celery lifecycle tuning) landed on 2026-04-07, rolling deploys should be mostly invisible to users:

- `task_time_limit = 360s` (6 min) — any chain step that exceeds this fails fast
- `task_soft_time_limit = 330s` (5.5 min) — graceful warning 30s before hard kill
- `broker_transport_options.visibility_timeout = 600s` (10 min) — orphaned unacked messages get re-delivered within 10 min
- `_ANALYSIS_TIMEOUT = 17 min` (watchdog) — safety net catches anything the above miss
- Worker `drainingSeconds = 900s` (15 min) — **ONLY if the Railway config has been applied** via `scripts/railway-service-config.py --apply`. If not applied, the worker still drains in 60s.

The deploy timing math:
```
  drainingSeconds (900s) > task_time_limit (360s)        — in-flight task can finish during drain
  visibility_timeout (600s) > task_time_limit (360s)     — no duplicate delivery while task runs
  watchdog (1020s) > task_time_limit + visibility_timeout (960s)  — safety net only fires after both other mechanisms failed
```

## Prerequisites

- `stuck-video.md` and `redis-inspect.md` runbooks available (you'll cross-reference them)
- Railway CLI, psycopg2, redis-py

## Step 1 — Confirm the deploy landed

```bash
railway status --json | python3 -c "
import json,sys
d = json.load(sys.stdin)
for e in d['environments']['edges'][0]['node']['serviceInstances']['edges']:
    node = e['node']
    meta = node['latestDeployment'].get('meta', {})
    print(f\"{node['serviceName']:<10} | commit {meta.get('commitHash','?')[:8]} | {node['latestDeployment'].get('status')}\")
"
```

Expected: all 3 services (`backend`, `worker`, `beat`) on the same commit, status `SUCCESS`. If any is on an old commit, the rolling deploy is still in progress — wait 2 min and re-run.

## Step 2 — Check for orphaned unacked tasks

```python
python3 <<'EOF'
import os, redis, json, base64
os.environ.setdefault("REDIS_URL", os.popen("railway variables --service Redis --kv 2>/dev/null | grep ^REDIS_PUBLIC_URL | cut -d= -f2-").read().strip())
r = redis.from_url(os.environ["REDIS_URL"])
unacked = r.hgetall("unacked")
print(f"unacked count: {len(unacked)}")
if unacked:
    print("Orphaned tasks:")
    for tag, msg in unacked.items():
        try:
            data = json.loads(msg)
            body = data[0] if isinstance(data, list) and len(data) > 0 else {}
            body_b64 = body.get("body") if isinstance(body, dict) else None
            if body_b64:
                decoded = base64.b64decode(body_b64).decode("utf-8", errors="replace")
                print(f"  {tag.decode()[:36]} -> {decoded[:200]}")
        except Exception:
            print(f"  {tag.decode()[:36]} (unparseable)")
EOF
```

Expected post-deploy state:
- 0 unacked → clean. Go to Step 3 just to confirm.
- 1-5 unacked → tasks interrupted by deploy. They WILL be re-delivered by Celery within `visibility_timeout` (10 min). Wait 10 min and re-run.
- More than 5 unacked → something is wrong. Escalate.

## Step 3 — Check for videos stuck in `analyzing` that aren't progressing

```python
python3 <<'EOF'
import os, psycopg2, psycopg2.extras
os.environ.setdefault("DATABASE_URL", os.popen("railway variables --service Postgres --kv 2>/dev/null | grep ^DATABASE_PUBLIC_URL | cut -d= -f2-").read().strip())
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
# Videos in analyzing state with started_at > 2 min ago (to filter out freshly-started chains)
cur.execute("""
  SELECT v.id, v.filename, v.status as v_status, a.status as a_status, a.current_step,
         a.started_at,
         (NOW() - a.started_at) as elapsed
  FROM videos v
  LEFT JOIN video_analyses a ON a.video_id = v.id
  WHERE v.status = 'analyzing'
    AND (a.started_at IS NULL OR a.started_at < NOW() - INTERVAL '2 minutes')
  ORDER BY a.started_at NULLS FIRST;
""")
rows = cur.fetchall()
print(f"Videos in analyzing >2 min: {len(rows)}")
for r in rows:
    print(f"  {str(r['id'])[:8]} | {r['filename'][:30]:<30} | step={r['current_step'] or '?':<10} | elapsed={r['elapsed']}")
conn.close()
EOF
```

Expected post-deploy state:
- 0 rows → clean. Deploy was invisible.
- 1-3 rows → videos caught mid-chain. They should advance within 10 min as tasks are re-delivered. Wait and re-check.
- More than 3 rows → deploy may have bricked multiple chains. Proceed to Step 4.

## Step 4 — If Step 3 shows multiple stuck videos, check the watchdog

The watchdog runs every 5 min. It should clean up stuck videos within 15-17 min of the deploy. Check worker logs for recent watchdog activity:

```bash
railway logs --service worker 2>&1 | grep -E "(reset_stuck|Watchdog)" | tail -20
```

Expected:
- `reset_stuck_analyses` entries every ~5 min
- If `videos_reset > 0`, the watchdog is doing its job

## Step 5 — If videos are still stuck after 20 min

The system failed to recover automatically. Options:

1. **Wait longer** — 17-min watchdog + 10-min visibility_timeout = 27 min worst case. If you're at 20 min, give it 7 more.

2. **Manual reset** — use `stuck-video.md` Step 4c to reset each stuck video one at a time.

3. **Emergency: bulk reset** — only if you're seeing a LOT of stuck videos:

   ```python
   python3 <<'EOF'
   import os, psycopg2
   # DRY RUN first — comment out commit at the bottom
   conn = psycopg2.connect(os.environ["DATABASE_URL"])
   cur = conn.cursor()
   cur.execute("""
     UPDATE video_analyses
     SET status = 'pending', current_step = NULL, started_at = NULL,
         completed_at = NULL, step_status = '{}'::json,
         chunk_completed_at = NULL, infer_completed_at = NULL,
         relate_completed_at = NULL, explain_completed_at = NULL, activate_completed_at = NULL
     WHERE status = 'processing' AND started_at < NOW() - INTERVAL '30 minutes'
     RETURNING video_id, status;
   """)
   print(f"reset {cur.rowcount} analyses:")
   for row in cur.fetchall():
       print(f"  {row}")
   cur.execute("""
     UPDATE videos
     SET status = 'transcribed', error_message = ''
     WHERE id IN (
       SELECT video_id FROM video_analyses
       WHERE status = 'pending' AND current_step IS NULL
     )
     AND status = 'analyzing'
     RETURNING id, status;
   """)
   print(f"reset {cur.rowcount} videos:")
   for row in cur.fetchall():
       print(f"  {row}")
   # conn.commit()   # <-- uncomment to actually commit
   print()
   print("DRY RUN — add conn.commit() to actually apply")
   conn.close()
   EOF
   ```

   **Always dry-run first.** Confirm the row count matches your expectation.

## Step 6 — Prevent this next time

1. Confirm `worker.drainingSeconds = 900` is applied on Railway. If not, run `scripts/railway-service-config.py --apply` (see `railway-deploy.md`).

2. Time your deploys for low-activity windows if possible. Check `/tmp/methodex-live.log` (if the live monitor is running) or the backend logs for recent `/analyze` POST activity.

3. If you need to deploy during high-activity periods, pause new analyses by (TODO — no maintenance-mode flag exists yet; Phase 2 feature).

## Escalation

Stop and ask for help if:
- More than 10 videos are stuck after running Step 5's bulk reset
- `reset_stuck_analyses` task itself is failing (worker logs show tracebacks)
- Sentry shows a burst of new error types after the deploy
- The deploy itself failed (`railway status --json` shows any service on FAILED or CRASHED)

## Related runbooks

- `stuck-video.md` — per-video debugging
- `redis-inspect.md` — Celery queue introspection
- `railway-deploy.md` — applying Railway config changes
