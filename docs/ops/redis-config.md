# Redis service configuration (methodex)

This runbook documents the Railway-managed Redis service that backs
methodex's Celery broker and result store.

## Target production startCommand

```
/bin/sh -c 'rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH --maxmemory 300mb --maxmemory-policy allkeys-lru'
```

The leading `rm -rf .../lost+found/` clears the ext4 directory that
Railway's mounted volume always contains — Redis refuses to start if
its data dir contains it.

## Why `maxmemory 300mb` + `allkeys-lru`

- Celery results expire in 10 minutes (`result_expires=600` in
  `backend/app/tasks/celery_app.py`).
- At Target B load (~25 concurrent analyses), the working set is a few
  KB per result × 25 results = well under 1 MB of useful data.
- 300 MB is roughly 300x headroom and `allkeys-lru` guarantees we never
  OOM-kill the broker — the oldest Celery result is evicted first.
- Before this was set, Redis had no memory bound. A pathological burst
  (or a stuck consumer) could fill memory and silently OOM-kill the
  broker, taking the whole task pipeline down with it.

## How to apply this config (Task 4.7 step)

The startCommand mutation is applied via the Railway GraphQL API.
**Do not run this during the Wave 2 PR review — apply alongside the
topology script in Task 4.7 after the WS4 PR merges.**

```bash
TOKEN=$(cat ~/.railway/config.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["token"])')

# Get the production environment id
ENV_ID=$(curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "User-Agent: methodex-redis-config/1.0" \
  -d '{"query":"{ project(id: \"154d302f-8609-4897-a10c-1f0d5bfc4f06\") { environments { edges { node { id name } } } } }"}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print([e['node']['id'] for e in d['data']['project']['environments']['edges'] if e['node']['name']=='production'][0])")

# Update Redis startCommand
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "User-Agent: methodex-redis-config/1.0" \
  -d "{\"query\":\"mutation UpdateRedis(\$input: ServiceInstanceUpdateInput!) { serviceInstanceUpdate(serviceId: \\\"53904bf4-fcad-426f-aec6-d94de78c3999\\\", environmentId: \\\"$ENV_ID\\\", input: \$input) }\",\"variables\":{\"input\":{\"startCommand\":\"/bin/sh -c 'rm -rf \$RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass \$REDIS_PASSWORD --save 60 1 --dir \$RAILWAY_VOLUME_MOUNT_PATH --maxmemory 300mb --maxmemory-policy allkeys-lru'\"}}}" \
  | python3 -m json.tool
```

Expected response: `{"data": {"serviceInstanceUpdate": null}}`. Railway
will redeploy Redis with the new startCommand automatically — expect a
~5-10 second blip in Celery broker connectivity. The backend
`/health/ready` endpoint will return 503 with `{"status":"redis_down"}`
during the restart window; replicas drop out of LB rotation until the
new Redis is up.

## How to verify after applying

```bash
# 1. Wait ~30s for Redis to redeploy
sleep 30

# 2. Confirm the new startCommand stuck
TOKEN=$(cat ~/.railway/config.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["token"])')
curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "User-Agent: methodex-redis-config/1.0" \
  -d '{"query":"{ project(id: \"154d302f-8609-4897-a10c-1f0d5bfc4f06\") { services { edges { node { id name serviceInstances { edges { node { startCommand } } } } } } } }"}' \
  | python3 -m json.tool | grep -A2 maxmemory

# 3. Confirm backend health is green
curl -f https://api.methodex.ai/health/ready
```

Expected: `maxmemory 300mb --maxmemory-policy allkeys-lru` shows up in
the startCommand, and `/health/ready` returns 200 `{"status":"ready"}`.

## To change the limit later

1. Edit the `--maxmemory` value in the curl command above (or in
   `scripts/railway-service-config.py` if/when this gets folded into the
   automated configurator).
2. Re-run the mutation.
3. Re-verify with the steps in the previous section.

There is no application code change required — the limit is purely a
Redis-server CLI flag.

## Capacity math

| Metric | Value |
|---|---|
| Celery `result_expires` | 600 s (10 min) |
| Concurrent analyses (Target B) | ~25 |
| Avg result payload size | ~2-5 KB |
| Working set | <1 MB |
| Max allowed | 300 MB |
| Headroom | ~300x |
| Eviction policy | `allkeys-lru` (oldest result evicted first) |

If we ever scale past Target B (e.g. multi-tenant concurrent runs in the
hundreds), revisit `maxmemory` and the underlying Railway Redis plan
(currently the free tier is 256 MB, the next tier up is 1 GB).
