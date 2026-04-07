# Runbook: Stuck video

## When to use

A user reports a video is stuck — it's been in `analyzing` or `transcribing` state for more than 10 minutes without the progress bar advancing, OR the watchdog has stamped it with `"error_type": "timeout"` in the error_message.

Symptoms that match this runbook:
- "It's been analyzing for 30 minutes"
- "The progress bar is frozen"
- `error_message` contains `"step": "watchdog", "error_type": "timeout"`
- `error_message` contains `"Video stuck in 'analyzing' with no active analysis"`

If the symptom is instead "it said failed but the video plays fine", that's an upload-layer issue — see `upload-false-negative.md` (not this runbook).

## Prerequisites

- Railway CLI installed (`railway --version`)
- `psycopg2-binary` in your Python (`python3 -c 'import psycopg2'`)
- `redis` in your Python (`python3 -c 'import redis'`)
- Railway workspace access (`railway whoami` should show your account)

## Step 1 — Identify the video

Get the video ID. If the user has the URL, parse it: `https://methodex.ai/videos/{video_id}`. Otherwise, ask for the filename and grep the DB.

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool

# Get DATABASE_URL from Railway (one-time per session)
railway service Postgres
export DATABASE_URL=$(railway variables --service Postgres --kv | grep ^DATABASE_PUBLIC_URL | cut -d= -f2-)
```

Now query the video state:

```python
python3 <<'EOF'
import os, psycopg2, psycopg2.extras
VIDEO_ID = "PASTE_VIDEO_ID_HERE"
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
cur.execute("""
  SELECT v.filename, v.status as v_status, v.error_message,
         a.status as a_status, a.current_step,
         a.started_at, a.completed_at,
         a.chunk_completed_at, a.infer_completed_at,
         a.relate_completed_at, a.explain_completed_at, a.activate_completed_at
  FROM videos v LEFT JOIN video_analyses a ON a.video_id = v.id
  WHERE v.id::text = %s
""", (VIDEO_ID,))
for r in cur.fetchall():
    for k, v in r.items(): print(f"  {k}: {v}")
conn.close()
EOF
```

Expected output: one row showing the current state.

## Step 2 — Classify the failure mode

Look at the row:

| `v_status` | `a_status` | `current_step` | Failure mode |
|---|---|---|---|
| `analyzing` | `processing` | `chunk`/`infer`/`relate`/`explain`/`activate` | Chain is running OR interrupted |
| `analyzing` | `error` | any | Orphaned — chain finished (errored) but video.status wasn't synced. Watchdog should catch this next tick |
| `error` | `error` | any | Chain failed and pipeline_error handler stamped it |
| `error` | `processing` | any | Chain is still running but video was marked errored externally (watchdog timeout or orphan sweep) |
| `transcribing` | n/a | n/a | Transcription phase — see the transcription section below |

## Step 3 — Check Redis for in-flight tasks

```bash
railway service Redis
export REDIS_URL=$(railway variables --service Redis --kv | grep ^REDIS_PUBLIC_URL | cut -d= -f2-)
```

```python
python3 <<'EOF'
import os, redis, json, base64
VIDEO_ID = "PASTE_VIDEO_ID_HERE"
r = redis.from_url(os.environ["REDIS_URL"])
print("queues: celery={} analyze={} transcribe={}".format(
    r.llen("celery"), r.llen("analyze"), r.llen("transcribe")))
print("unacked:", r.hlen("unacked"))
print()
for tag, msg in r.hgetall("unacked").items():
    try:
        data = json.loads(msg)
        body_b64 = data[0].get("body") if isinstance(data, list) and isinstance(data[0], dict) else None
        if body_b64:
            decoded = base64.b64decode(body_b64).decode("utf-8", errors="replace")
            if VIDEO_ID in decoded:
                print(f"FOUND unacked task for this video:")
                print(f"  TAG: {tag.decode()[:36]}")
                print(f"  body[:300]: {decoded[:300]}")
    except Exception as e:
        print(f"  parse error on {tag.decode()[:36]}: {e}")
EOF
```

Expected output:
- If the video has a task in `unacked`, it means the task was delivered to a worker but not acked — typically because a deploy killed the worker mid-execution.
- If queues are empty and no unacked matches the video, there's no active Celery task for this video.

## Step 4 — Diagnose

Based on Step 2 + Step 3, pick one:

### 4a. Chain interrupted by deploy (unacked task exists for this video)

Since the PR #19 Celery lifecycle tuning landed on 2026-04-07, the broker `visibility_timeout` is 600s and the worker `drainingSeconds` is 900s (IF the Railway config has been applied — see `railway-deploy.md`). The orphaned task should be re-delivered within 10 minutes.

**Action:** Wait 10 minutes. Re-run Step 1 and Step 3. If the task is gone from unacked and the video has advanced, you're done. If not, proceed to 4b.

### 4b. Worker is silent and no task is queued (post-deploy orphan OR pre-fix stuck)

The watchdog at `_ANALYSIS_TIMEOUT = 17 min` (post PR #19) will catch this. If `a.started_at` was less than 17 min ago, wait for the watchdog. If more than 17 min ago, the watchdog may have already run and the error message should reflect that — re-run Step 1.

**Action if watchdog has already errored it:** go to 4c.

### 4c. Manually reset the video so the user can retry

You've confirmed the video is in a terminal errored state with no active task. The PR #21 retry-reset-analysis fix is now in prod, so clicking "Retry Analysis" in the UI will now correctly reset and re-dispatch the chain. **Tell the user to click Retry Analysis.**

If the user can't access the UI for some reason, OR if the video's state got into a truly inconsistent place, manually reset:

```python
python3 <<'EOF'
import os, psycopg2
VIDEO_ID = "PASTE_VIDEO_ID_HERE"
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

# Reset the analysis row
cur.execute("""
  UPDATE video_analyses
  SET status = 'pending',
      current_step = NULL,
      started_at = NULL,
      completed_at = NULL,
      chunk_completed_at = NULL,
      infer_completed_at = NULL,
      relate_completed_at = NULL,
      explain_completed_at = NULL,
      activate_completed_at = NULL,
      step_status = '{}'::json,
      chunks = NULL, inferences = NULL, patterns = NULL, insights = NULL, design_principles = NULL
  WHERE video_id = %s
  RETURNING id, status;
""", (VIDEO_ID,))
print("analysis reset:", cur.fetchone())

# Reset the video row to transcribed (pre-analyze state)
cur.execute("""
  UPDATE videos
  SET status = 'transcribed', error_message = ''
  WHERE id = %s
  RETURNING id, status;
""", (VIDEO_ID,))
print("video reset:", cur.fetchone())

conn.commit()
cur.close()
conn.close()
print()
print("Done. Tell the user to click Retry Analysis in the UI.")
EOF
```

Caveat: this assumes the transcript is fine. If the transcript is also errored, reset `transcripts.status = 'completed'` first (ONLY if AssemblyAI actually succeeded — check by ID in AssemblyAI dashboard).

## Step 5 — Verify the fix worked

After the user clicks retry (or 5 minutes after manual intervention), re-run Step 1. Expected trajectory for a healthy chain:

```
T+0:    v_status=analyzing,  a_status=processing,  current_step=chunk
T+2:    v_status=analyzing,  a_status=processing,  current_step=infer
T+4:    v_status=analyzing,  a_status=processing,  current_step=relate
T+6:    v_status=analyzing,  a_status=processing,  current_step=explain
T+8:    v_status=analyzing,  a_status=processing,  current_step=activate
T+10:   v_status=analyzed,   a_status=completed,   current_step=activate
```

If you see any step hang for more than 2 minutes, the LLM is slow — check Sentry for recent `JSONDecodeError` or `APIStatusError` events, and check the worker logs for OpenRouter HTTP failures.

## Escalation

Stop and ask for help if:
- You've followed 4c (manual reset) twice and the video keeps hitting the same error
- Sentry shows a burst of errors from other users in the same time window
- The worker service on Railway is unhealthy (`railway logs --service worker` shows repeated crashes)
- The user reports data loss (missing chunks/insights/principles from a previously-completed analysis)

## Related runbooks

- `deploy-interrupt-recovery.md` — if you suspect a deploy caused the stuck state and more than one video is affected
- `redis-inspect.md` — for deeper Celery queue debugging
- `db-snapshot.md` — for broader project-level state queries
