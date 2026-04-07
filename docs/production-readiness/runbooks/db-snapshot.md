# Runbook: Production DB snapshot

## When to use

You need to query production Postgres directly — for debugging a user's project, inspecting stuck videos, or doing ad-hoc data exploration. This runbook captures the read-only query patterns used during the 2026-04-07 incident.

## Prerequisites

- Railway CLI installed
- `psycopg2-binary` installed (`pip install psycopg2-binary` or use the backend venv)

## Get the DB URL

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool
railway service Postgres
export DATABASE_URL=$(railway variables --service Postgres --kv | grep ^DATABASE_PUBLIC_URL | cut -d= -f2-)
echo $DATABASE_URL  # verify — should be postgres://postgres:...@ballast.proxy.rlwy.net:45966/railway
```

## Test the connection

```bash
python3 -c "
import os, psycopg2
conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()
cur.execute('SELECT current_database(), current_user, version();')
print(cur.fetchone())
conn.close()
"
```

## Find a user

By email:

```python
python3 <<'EOF'
import os, psycopg2, psycopg2.extras
EMAIL_SUBSTRING = "anurag"   # case-insensitive substring match
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
cur.execute("""
  SELECT id, email, first_name, last_name, role, created_at, last_seen,
         CASE WHEN encrypted_api_key IS NOT NULL THEN 'yes' ELSE 'no' END as has_api_key,
         key_total_credits, key_total_usage,
         (COALESCE(key_total_credits, 0) - COALESCE(key_total_usage, 0)) as balance
  FROM users
  WHERE LOWER(email) LIKE %s
  ORDER BY last_seen DESC NULLS LAST;
""", (f"%{EMAIL_SUBSTRING.lower()}%",))
for r in cur.fetchall():
    print(dict(r))
conn.close()
EOF
```

Key gotcha: `users.id` IS the Clerk user ID (e.g., `user_3AxdbQcz1lffGHVhwH9diyRLNAL`). There is no separate `clerk_user_id` column.

## Find a project by name

```python
python3 <<'EOF'
import os, psycopg2, psycopg2.extras
NAME_SUBSTRING = "haic"
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
cur.execute("""
  SELECT id, name, status, user_id, created_at, updated_at, error_message
  FROM projects
  WHERE LOWER(name) LIKE %s
  ORDER BY created_at DESC;
""", (f"%{NAME_SUBSTRING.lower()}%",))
for r in cur.fetchall():
    print(dict(r))
conn.close()
EOF
```

## Snapshot a project's state

Full per-video breakdown of a project:

```python
python3 <<'EOF'
import os, psycopg2, psycopg2.extras
PROJECT_ID = "8b894631-2d32-4593-ae2a-e76e6d9f84f3"  # HAIC example
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

print("=== Project ===")
cur.execute("SELECT id, name, status, updated_at FROM projects WHERE id::text = %s;", (PROJECT_ID,))
print(dict(cur.fetchone() or {}))

print()
print("=== Videos + analyses ===")
cur.execute("""
  SELECT v.id, v.filename, v.status as v_status, v.error_message,
         a.status as a_status, a.current_step,
         a.started_at, a.completed_at
  FROM videos v
  LEFT JOIN video_analyses a ON a.video_id = v.id
  WHERE v.project_id::text = %s
  ORDER BY v.uploaded_at;
""", (PROJECT_ID,))
for r in cur.fetchall():
    print(f"  {r['filename'][:35]:<35} V={r['v_status']:<11} A={(r['a_status'] or '—NONE—'):<11} step={r['current_step'] or ''}")

print()
print("=== Transcripts ===")
cur.execute("""
  SELECT t.id, t.video_id, t.status, t.assemblyai_id, t.created_at
  FROM transcripts t
  WHERE t.video_id IN (SELECT id FROM videos WHERE project_id::text = %s);
""", (PROJECT_ID,))
for r in cur.fetchall():
    print(dict(r))

print()
print("=== Cross-video analyses ===")
cur.execute("""
  SELECT id, status, started_at, completed_at,
         cardinality(video_ids) as video_count
  FROM project_analyses
  WHERE project_id::text = %s
  ORDER BY started_at DESC NULLS LAST;
""", (PROJECT_ID,))
for r in cur.fetchall():
    print(dict(r))
conn.close()
EOF
```

## Schema reference

The DB schema drifts. If a query fails with `UndefinedColumn`, first check what columns actually exist:

```python
python3 <<'EOF'
import os, psycopg2, psycopg2.extras
TABLE = "video_analyses"  # or videos, projects, transcripts, users, project_analyses, speaker_labels
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
cur.execute("""
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = %s
  ORDER BY ordinal_position;
""", (TABLE,))
for c in cur.fetchall():
    print(f"  {c['column_name']:30} {c['data_type']:25} null={c['is_nullable']}")
conn.close()
EOF
```

Gotchas that cost me time on 2026-04-07:
- `videos` has `uploaded_at`, NOT `created_at`
- `users.id` IS the Clerk ID (no separate column)
- `projects.user_id`, NOT `owner_user_id`
- `video_analyses` does NOT have `updated_at` — use `started_at` for ordering
- `status` fields are `VARCHAR(50)`, not enums yet (PR #22 state-machine-enums is adding enforcement)

## NEVER run in production

- `DELETE` without a `WHERE` clause — obviously
- `TRUNCATE` — irreversible
- Migrations outside Alembic — see the `alembic_version` table for the current head
- `UPDATE` on `users` — preserve Clerk sync
- Any query that joins `videos` to `video_analyses` to jsonb without `LIMIT` — can return hundreds of MB of embedded analysis data

## Safe write patterns (for incident response)

Resetting a single stuck video to retriable state (used during the 2026-04-07 incident):

```python
# See stuck-video.md Step 4c for the exact reset block
```

Always wrap writes in an explicit transaction and include `RETURNING` so you see what changed:

```python
python3 <<'EOF'
import os, psycopg2
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()
try:
    cur.execute("""
      UPDATE videos SET error_message = '' WHERE id::text = %s RETURNING id, status, error_message;
    """, ("PASTE_ID",))
    print("updated:", cur.fetchone())
    input("Press Enter to commit, Ctrl-C to rollback...")
    conn.commit()
except KeyboardInterrupt:
    conn.rollback()
    print("rolled back")
finally:
    cur.close()
    conn.close()
EOF
```

## Related runbooks

- `stuck-video.md` — specific recipes for stuck-video debugging
- `redis-inspect.md` — for Celery queue state
- `railway-deploy.md` — for applying Railway service config changes
