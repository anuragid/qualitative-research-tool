# Railway Infrastructure as Code (methodex)

`railway.ts` describes the whole `methodex` project in `production`: the
`backend`, `worker` and `beat` services, Postgres, Redis, their volumes and
the `api.methodex.ai` domain. It replaces Config as Code (`/railway.toml`),
which Railway stops reading on **2026-12-01**.

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
- While `/railway.toml` still exists it wins at deploy time for
  `dockerfilePath` and the restart policy. Change both files together until
  it is deleted.
- Redis' start command now lives here. Change it in `railway.ts` instead of
  the GraphQL mutation in `docs/ops/redis-config.md`, or the next apply will
  revert it.

## Cutover from railway.toml (one-time)

At migration time (2026-10-24), `railway config plan` showed
`0 to add, 6 to change, 0 to destroy`. Every change copies a value that
`railway.toml` already applies at deploy time into the service's own
settings:

| Service | Setting | Dashboard today | Effective today (railway.toml) |
|---|---|---|---|
| backend | builder | unset (Railpack) | `DOCKERFILE` |
| backend | dockerfilePath | unset | `backend/Dockerfile.railway` |
| worker, beat | dockerfilePath | `backend/Dockerfile.worker` | `backend/Dockerfile.railway` |
| all three | restart policy | unset | `ON_FAILURE`, 10 retries |

So the order matters. **Apply before `railway.toml` stops being read.** If
the toml goes first, the next deploy builds `backend` with Railpack and
`worker`/`beat` from `Dockerfile.worker`, which expects a `backend/` build
context and fails at `COPY requirements.txt`.

1. `railway config plan`: expect exactly the six changes above, with
   nothing on Postgres, Redis, volumes, domains or variables.
2. `railway config apply`.
3. `railway config plan` again: expect no changes.
4. Delete `/railway.toml` in its own PR. `railway config migrate status`
   reports that no service has an explicit Config File path. The services
   pick up the root `railway.toml` by default, so deleting the file is what
   switches them off it. Run `railway config migrate status` first in case
   that has changed. If a service shows an explicit path, run
   `railway config migrate cutover` for it (it can be undone with
   `migrate undo`).
5. After that PR deploys, check each service's build log for
   `load build definition from backend/Dockerfile.railway`. Then check its
   deployment metadata: `meta.serviceManifest` should show `DOCKERFILE` and
   `ON_FAILURE` / 10, and `meta.configFile` should no longer be
   `/railway.toml`:

   ```bash
   railway deployment list --service worker --limit 1 --json
   railway logs --build --service worker <deployment-id> --lines 400 | grep "build definition"
   ```

### Variables to check before step 4

These are variables, so this file leaves them alone. Their values were
compared without being printed:

- `worker` has `RAILWAY_DOCKERFILE_PATH=backend/Dockerfile.worker`. Today the
  `railway.toml` path beats it (worker builds `Dockerfile.railway`). Railway
  doesn't document whether the service setting also beats it once the toml is
  gone. Delete that variable first, or watch step 5 for the worker. `backend`'s
  copy already points at `backend/Dockerfile.railway`.
- `backend` has `NIXPACKS_BUILD_CMD`. It is inert under the `DOCKERFILE`
  builder and can be removed.
