# Runbook: Inspect Redis (Celery broker)

## When to use

You need to see what Celery is doing right now — queue depth, unacked messages, what task is owned by which worker. Typical triggers:

- A video is stuck (see `stuck-video.md`) and you need to confirm whether there's an actual Celery task for it
- A deploy just happened and you want to verify no tasks got orphaned
- You want to see the state of the `celery-task-meta-*` result keys for a specific task ID

## Prerequisites

- Railway CLI installed
- `redis` in your Python (`python3 -c 'import redis'`)

## Get the broker URL

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool
railway service Redis
export REDIS_URL=$(railway variables --service Redis --kv | grep ^REDIS_PUBLIC_URL | cut -d= -f2-)
# Verify
echo $REDIS_URL  # should be redis://default:...@yamabiko.proxy.rlwy.net:50187
```

## Check queue depth

```python
python3 <<'EOF'
import os, redis
r = redis.from_url(os.environ["REDIS_URL"])
print("PING:", r.ping())
print()
print("=== Celery queues ===")
for q in ("celery", "analyze", "transcribe"):
    print(f"  {q:<10}: {r.llen(q)} pending")
print()
print(f"unacked hash size: {r.hlen('unacked')}")
print(f"unacked_index zset size: {r.zcard('unacked_index')}")
EOF
```

Expected output (healthy idle state):
```
PING: True
=== Celery queues ===
  celery    : 0 pending
  analyze   : 0 pending
  transcribe: 0 pending

unacked hash size: 0
unacked_index zset size: 0
```

If queues have entries, the worker is behind. If unacked has entries, a task has been delivered but not acked — either currently running OR orphaned.

## List unacked messages with decoded bodies

```python
python3 <<'EOF'
import os, redis, json, base64
r = redis.from_url(os.environ["REDIS_URL"])
if r.hlen("unacked") == 0:
    print("No unacked messages.")
else:
    for tag, msg in r.hgetall("unacked").items():
        try:
            data = json.loads(msg)
            body = data[0] if isinstance(data, list) and len(data) > 0 else {}
            body_b64 = body.get("body") if isinstance(body, dict) else None
            print(f"TAG: {tag.decode()}")
            if body_b64:
                decoded = base64.b64decode(body_b64).decode("utf-8", errors="replace")
                # The body is a JSON array: [args, kwargs, options]
                # args[0] is typically the video_id for analyze chain tasks
                print(f"  decoded body (first 400 chars): {decoded[:400]}")
            # Task name is in data[2].get("task") for Celery protocol v2
            if isinstance(data, list) and len(data) > 2 and isinstance(data[2], dict):
                task_name = data[2].get("task")
                if task_name:
                    print(f"  task: {task_name}")
            print()
        except Exception as e:
            print(f"TAG: {tag.decode()[:36]} parse error: {e}")
EOF
```

## Look up a specific task result by ID

If you know a task ID (e.g., from worker logs `Task analyze_chunk_step[abc-123-...] started`):

```python
python3 <<'EOF'
import os, redis, json
TASK_ID = "PASTE_TASK_ID_HERE"
r = redis.from_url(os.environ["REDIS_URL"])
key = f"celery-task-meta-{TASK_ID}"
val = r.get(key)
if val is None:
    print(f"No result for task {TASK_ID} — task may still be running, or result has expired (default TTL 24h)")
else:
    data = json.loads(val)
    print(f"Task result for {TASK_ID}:")
    for k, v in data.items():
        print(f"  {k}: {v}")
EOF
```

## Manually drop an unacked message (DANGEROUS)

**Only do this if you are absolutely certain** the task is orphaned and needs to be removed. Celery's Redis transport will normally re-deliver unacked messages after `visibility_timeout` (600s post PR #19). If you manually drop, the task is lost forever.

```python
python3 <<'EOF'
import os, redis
TAG = "PASTE_TAG_FROM_UNACKED_LIST_HERE"
r = redis.from_url(os.environ["REDIS_URL"])
# Remove from both the hash and the index
removed = r.hdel("unacked", TAG)
r.zrem("unacked_index", TAG)
print(f"Removed {removed} entry from unacked.")
EOF
```

Preferred alternative: wait for `visibility_timeout` (10 min), or restart the worker which forces a re-scan. Or manually reset the video's DB state (`stuck-video.md` Step 4c) which sidesteps the Celery task entirely.

## Check Celery beat scheduler entries

Beat stores its schedule in a file inside the beat container, not Redis. To check that beat is actually firing, look at the worker logs for `reset_stuck_analyses` entries:

```bash
railway logs --service worker 2>&1 | grep -E "reset_stuck_analyses|watchdog" | tail -20
```

Expected: one entry every 5 minutes, matching the beat schedule at `backend/app/tasks/celery_app.py:170-172`. If entries are missing or firing multiple times per interval, beat is broken — check `railway logs --service beat`.

## Memory check

Redis has `maxmemory=300mb` and `maxmemory-policy=allkeys-lru` per PR #10 (Wave 2 scaling). Verify memory isn't full:

```python
python3 <<'EOF'
import os, redis
r = redis.from_url(os.environ["REDIS_URL"])
info = r.info("memory")
used_mb = info["used_memory"] / (1024 * 1024)
max_mb = info.get("maxmemory", 0) / (1024 * 1024)
pct = (used_mb / max_mb * 100) if max_mb else 0
print(f"used_memory: {used_mb:.1f} MB")
print(f"maxmemory:   {max_mb:.1f} MB")
print(f"utilization: {pct:.1f}%")
if pct > 80:
    print("⚠️  Over 80% — LRU evictions may be dropping celery-task-meta results")
EOF
```

## Related runbooks

- `stuck-video.md` — diagnose stuck videos (uses this runbook's commands)
- `deploy-interrupt-recovery.md` — for multi-video fallout from a deploy
