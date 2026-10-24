# Railway Infrastructure as Code (methodex)

`railway.ts` describes the whole `methodex` project in `production`: the
`backend`, `worker` and `beat` services, Postgres, Redis, their volumes and
the `api.methodex.ai` domain. It replaced Config as Code (`/railway.toml`,
deleted after the 2026-10-24 cutover below).

Railway does not read this directory during deploys. A change here does
nothing until someone runs `railway config apply`.

## Commands

The CLI engine needs the pinned SDK next to the file (`package.json` here, not
at the repo root, so the frontend's Cloudflare build never installs it):

```bash
npm ci --prefix .railway
railway config plan      # read-only; variable values are redacted
railway config apply     # re-plans, asks for confirmation, then applies
```

Run them from the repo root of a checkout linked to `methodex` / `production`.
For a reviewed change, pin the plan:
`railway config plan --out plan.json`, then
`railway config apply --plan plan.json --yes`.

## Rules for editing

- **Whole-project file.** An apply can delete any resource that is missing
  here. Keep every service, database and volume declared.
- **Variables are unmanaged** (`variables: { managed: false }`). Set and rotate
  secrets in the dashboard. Don't add `env` blocks unless the file should take
  ownership of those variables.
- **Database images are pinned** to what is running
  (`postgres-ssl:17`, `redis:8.2.9`). If the pin is dropped, the SDK/CLI
  defaults (`postgres:18`, `railwayapp/redis:8.2`) apply, and Postgres 18
  cannot start on the existing v17 data volume.
- **No start commands** on `backend` / `worker` / `beat`. The shared image's
  ENTRYPOINT (`backend/scripts/startup.sh`) picks the process from each
  service's `SERVICE_TYPE` variable.
- **No restart policy is declared.** Railway's default (`ON_FAILURE`,
  10 retries) is what `railway.toml` used to set. The platform stores that
  default as unset, so declaring it leaves a plan diff that never clears.
  Only declare a policy if you want a non-default one.
- **Redis' start command lives here.** Change it in `railway.ts` instead of
  the GraphQL mutation in `docs/ops/redis-config.md`, or the next apply will
  revert it.
- Settings this file doesn't declare (runtime `V2`, IPv6 egress, sleep and so
  on) are left as they are in the dashboard.

## Cutover record (2026-10-24)

`railway config migrate` builds its output from the stored dashboard
settings plus `railway.toml`. Before the cutover, the dashboard still held
values that `railway.toml` overrode at deploy time:

| Service | Setting | Dashboard before | Effective (railway.toml) |
|---|---|---|---|
| backend | builder | unset (Railpack) | `DOCKERFILE` |
| backend | dockerfilePath | unset | `backend/Dockerfile.railway` |
| worker, beat | dockerfilePath | `backend/Dockerfile.worker` | `backend/Dockerfile.railway` |
| all three | restart policy | unset | `ON_FAILURE`, 10 retries (same as Railway's default) |

That is why `railway config apply` had to run **before** `railway.toml` was
deleted. Otherwise the next deploy would have built `backend` with Railpack,
and `worker`/`beat` from `Dockerfile.worker`, which expects a `backend/`
build context and fails at `COPY requirements.txt`.

1. Merged the IaC file (PR #71). `railway config plan` showed
   `0 to add, 6 to change, 0 to destroy`: the four rows above, with nothing
   on databases, volumes, domains or variables.
2. Applied that pinned plan. The build settings were written. The restart
   policy stayed unset, because Railway stores its default that way.
   Deployments still resolved it to `ON_FAILURE` / 10.
3. Removed the restart-policy declaration. `railway config plan` then showed
   "Your Railway configuration is already up to date."
4. Deleted `/railway.toml`. `railway config migrate status` already showed no
   service with an explicit Config File path. The services had been picking up
   the root file by default, so deleting it was the whole switch and no
   `migrate cutover` was needed.

To check a deploy:

```bash
railway deployment list --service worker --limit 1 --json   # meta.serviceManifest, meta.configFile
railway logs --build --service worker <deployment-id> --lines 400 | grep "build definition"
```

Expect `load build definition from backend/Dockerfile.railway`, builder
`DOCKERFILE`, restart `ON_FAILURE` / 10, and no `/railway.toml` in
`meta.configFile`.

### Leftover variables

These are variables, so this file leaves them alone. Their values were
compared without being printed:

- `worker` has `RAILWAY_DOCKERFILE_PATH=backend/Dockerfile.worker`. While
  `railway.toml` existed, its path beat this variable. Railway doesn't
  document whether the service's `dockerfilePath` setting also beats it. If a
  worker build log ever shows `Dockerfile.worker`, delete the variable.
  `backend`'s copy already points at `backend/Dockerfile.railway`.
- `backend` has `NIXPACKS_BUILD_CMD`. It is inert under the `DOCKERFILE`
  builder and can be removed.
