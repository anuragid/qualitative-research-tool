#!/usr/bin/env python3
"""Idempotent Railway service configuration for the methodex project.

Applies the target topology (replicas, healthchecks, drain settings) to
each service via the Railway GraphQL API. Safe to re-run — Railway's
serviceInstanceUpdate mutation is idempotent and no-ops on unchanged
fields.

Also creates the new 'beat' service if it doesn't yet exist, removes
the worker's unused public domain, and gates Railway auto-deploy on
GitHub check suites passing (the "Wait for CI" setting).

SAFETY: the default behaviour is dry-run. You must pass ``--apply`` to
actually mutate Railway. An accidental ``python3 railway-service-config.py``
will print the proposed plan and exit zero without touching anything.

Usage:
    export RAILWAY_API_TOKEN=$(cat ~/.railway/config.json \\
        | python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["token"])')

    # Default: dry-run only
    python3 scripts/railway-service-config.py

    # Explicit dry-run (same as default)
    python3 scripts/railway-service-config.py --dry-run

    # Actually apply the changes
    python3 scripts/railway-service-config.py --apply

Exit codes:
    0 — success (or dry-run completed)
    1 — any mutation, validation, or HTTP failure
    2 — missing env vars / argparse misuse

Local SSL note:
    On macOS with Anaconda Python you may see
    ``CERTIFICATE_VERIFY_FAILED: unable to get local issuer certificate``.
    Workaround:  ``SSL_CERT_FILE=$(python3 -m certifi) python3 scripts/railway-service-config.py``
    System Python has the certs and works without SSL_CERT_FILE.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any

RAILWAY_API = "https://backboard.railway.app/graphql/v2"

PROJECT_ID = "154d302f-8609-4897-a10c-1f0d5bfc4f06"
WORKSPACE_ID = "37eb4e96-0873-4033-a392-3c6593a68802"

# Target topology — edit here to change replica/health settings.
# Keep in sync with backend/app/database.py pool sizing math.
TARGET: dict[str, dict[str, Any]] = {
    "backend": {
        "id": "2b70a900-042c-4083-b00b-0d01f3ece5dc",
        # Scaled 2 -> 1 on 2026-08-19: real traffic was ~0 (24h of backend logs
        # were 154 scanner 404s + 4 health probes + 3 API hits), and 2 replicas
        # put project memory at ~0.87 GB / ~$8.9-mo, well over the Hobby plan's
        # included $5 usage. At 1 replica each for backend+worker the project
        # sits at ~0.48 GB / ~$4.9-mo, which is the billing floor — reducing
        # further saves nothing. RAISE BACK TO 2 when semester load returns.
        "numReplicas": 1,
        "healthcheckPath": "/health/ready",
        "healthcheckTimeout": 10,
        "drainingSeconds": 30,
    },
    "worker": {
        "id": "08097b12-1501-4dff-a990-edcd95c73ed4",
        # Scaled 2 -> 1 on 2026-08-19 alongside backend — see note above.
        "numReplicas": 1,
        # workers have no HTTP endpoint — leave healthcheckPath unset
        "healthcheckPath": None,
        # PR #19: must allow in-flight chain steps (up to task_time_limit=360s)
        # to finish gracefully and give the broker visibility_timeout (600s)
        # room to re-deliver any stranded unacked messages before SIGKILL.
        # 900s (15 min) = task_time_limit + visibility_timeout + slack.
        "drainingSeconds": 900,
    },
    "beat": {
        # id is populated at runtime if the service already exists,
        # otherwise it gets created during this script
        "id": None,
        "numReplicas": 1,
        "healthcheckPath": None,
        "drainingSeconds": 10,
        "createIfMissing": True,
    },
}


# ---------------------------------------------------------------------------
# Low-level GraphQL helpers
# ---------------------------------------------------------------------------


def gql(query: str, variables: dict, token: str) -> dict:
    """Send a GraphQL request to Railway's API and return the ``data`` field.

    Raises RuntimeError on HTTP errors or GraphQL errors.
    """
    body = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    req = urllib.request.Request(
        RAILWAY_API,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            # Cloudflare WAF (in front of railway.app) returns 403/1010
            # to clients with no User-Agent, so set a polite identifying one.
            "User-Agent": "methodex-railway-service-config/1.0 (+https://methodex.ai)",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Railway API HTTP {e.code}: {body_txt}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Railway API unreachable: {e.reason}") from e
    if "errors" in data and data["errors"]:
        raise RuntimeError(f"Railway GraphQL errors: {data['errors']}")
    return data["data"]


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------


def list_services(token: str) -> list[dict]:
    query = """
    query ListServices($projectId: String!) {
        project(id: $projectId) {
            services { edges { node { id name } } }
        }
    }
    """
    data = gql(query, {"projectId": PROJECT_ID}, token)
    return [e["node"] for e in data["project"]["services"]["edges"]]


def get_production_environment_id(token: str) -> str:
    """Return the production environment id for our project."""
    query = """
    query Envs($projectId: String!) {
        project(id: $projectId) {
            environments { edges { node { id name } } }
        }
    }
    """
    data = gql(query, {"projectId": PROJECT_ID}, token)
    for e in data["project"]["environments"]["edges"]:
        if e["node"]["name"] == "production":
            return e["node"]["id"]
    raise RuntimeError("production environment not found")


# ---------------------------------------------------------------------------
# Mutation helpers
# ---------------------------------------------------------------------------


def update_service_instance(
    token: str,
    service_id: str,
    env_id: str,
    updates: dict,
    apply: bool,
) -> None:
    """Mutate serviceInstanceUpdate with the given updates.

    When ``apply`` is False this only prints what would change.
    """
    if not apply:
        print(f"  [DRY] would update service {service_id}: {updates}")
        return

    mutation = """
    mutation UpdateInstance($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
        serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }
    """
    gql(
        mutation,
        {
            "serviceId": service_id,
            "environmentId": env_id,
            "input": updates,
        },
        token,
    )
    print(f"  applied to {service_id}: {sorted(updates.keys())}")


def ensure_beat_service_exists(
    token: str,
    existing_services: list[dict],
    env_id: str,
    apply: bool,
) -> str | None:
    """Create the 'beat' service if it doesn't exist. Return its id (or None
    in dry-run when the service is missing)."""
    for svc in existing_services:
        if svc["name"] == "beat":
            print(f"  beat service already exists: {svc['id']}")
            return svc["id"]

    if not apply:
        print("  [DRY] would create 'beat' service (currently missing)")
        print("        and set SERVICE_TYPE=beat env var on it")
        return None

    create_mutation = """
    mutation CreateBeat($projectId: String!, $name: String!) {
        serviceCreate(input: { projectId: $projectId, name: $name }) {
            id name
        }
    }
    """
    data = gql(
        create_mutation,
        {"projectId": PROJECT_ID, "name": "beat"},
        token,
    )
    beat_id = data["serviceCreate"]["id"]
    print(f"  created beat service: {beat_id}")

    # Set SERVICE_TYPE=beat. Source config (repo + Dockerfile) still has
    # to be wired up by hand in the Railway dashboard the first time —
    # see Task 4.7 of the WS4 plan for the manual step.
    #
    # WARNING (learned the hard way 2026-08-19): this sets SERVICE_TYPE and
    # NOTHING ELSE, so a beat service provisioned here starts with an env set
    # that cannot satisfy app.config.Settings under APP_ENV=production. beat
    # silently crash-looped for 2 months on a missing CLERK_ISSUER — it burned
    # its 10 ON_FAILURE retries, then sat there reporting deployment status
    # SUCCESS with numReplicas=1 while running nothing, so no watchdog
    # (reset_stuck_analyses) or model validation fired the entire time.
    # Railway shows no failure for this state; the only tells are an empty log
    # stream and a memory metric series that stops.
    # If you add a REQUIRED setting to Settings, propagate it to backend,
    # worker AND beat. Verify with:
    #   railway variables -s beat --kv | sed 's/=.*//' | sort
    # diffed against the same for backend.
    variable_mutation = """
    mutation SetVar($input: VariableUpsertInput!) {
        variableUpsert(input: $input)
    }
    """
    gql(
        variable_mutation,
        {
            "input": {
                "projectId": PROJECT_ID,
                "environmentId": env_id,
                "serviceId": beat_id,
                "name": "SERVICE_TYPE",
                "value": "beat",
            },
        },
        token,
    )
    print(f"  set SERVICE_TYPE=beat on {beat_id}")

    return beat_id


def list_deployment_triggers(
    token: str,
    env_id: str,
    service_id: str,
) -> list[dict]:
    """Return all deployment triggers for a service in the given environment.

    Each node has at minimum: id, serviceId, branch, checkSuites, provider, repository.
    The ``checkSuites`` field controls Railway's "Wait for CI" gate — when True,
    Railway will not auto-deploy a push until all GitHub check suites on that commit
    have a successful conclusion (i.e., GitHub Actions CI must pass first).
    """
    query = """
    query DeploymentTriggers(
        $projectId: String!
        $environmentId: String!
        $serviceId: String!
    ) {
        deploymentTriggers(
            projectId: $projectId
            environmentId: $environmentId
            serviceId: $serviceId
        ) {
            edges {
                node {
                    id
                    serviceId
                    branch
                    checkSuites
                    provider
                    repository
                    environmentId
                }
            }
        }
    }
    """
    data = gql(
        query,
        {
            "projectId": PROJECT_ID,
            "environmentId": env_id,
            "serviceId": service_id,
        },
        token,
    )
    return [e["node"] for e in data["deploymentTriggers"]["edges"]]


def enable_check_suites_gate(
    token: str,
    env_id: str,
    service_ids: list[str],
    service_names: list[str],
    apply: bool,
) -> None:
    """Set checkSuites=True on the *main-branch* deployment triggers only.

    ``checkSuites=True`` is Railway's "Wait for CI" setting: the auto-deploy
    is held until all GitHub check suites on the pushed commit reach a
    successful conclusion. This prevents a commit with failing GitHub Actions
    CI from being deployed automatically.

    Branch filter: only triggers whose ``branch`` is ``main`` are gated.
    Preview/PR-environment triggers stay ungated so that experimental branches
    (which may not run the full check suite, or whose suites may include
    third-party apps that never conclude) deploy without waiting. Railway
    watches ALL check suites on a commit, not just our workflows, so gating
    non-main triggers is both unnecessary and a stall risk.

    The mutation used is ``deploymentTriggerUpdate`` which accepts:
        id        – trigger id (required)
        input     – DeploymentTriggerUpdateInput { branch, checkSuites, repository, rootDirectory }

    When ``apply`` is False, only the current state is printed (read-only).
    """
    GATED_BRANCH = "main"
    any_trigger_found = False
    for service_id, service_name in zip(service_ids, service_names):
        triggers = list_deployment_triggers(token, env_id, service_id)
        if not triggers:
            print(
                f"  {service_name} ({service_id}): no deployment triggers found "
                "(service may not be connected to a GitHub repo yet)"
            )
            continue

        for trigger in triggers:
            any_trigger_found = True
            trigger_id = trigger["id"]
            current = trigger.get("checkSuites")
            branch = trigger.get("branch", "?")
            repo = trigger.get("repository", "?")
            print(
                f"  {service_name}: trigger {trigger_id} "
                f"branch={branch} repo={repo} checkSuites={current}"
            )

            if branch != GATED_BRANCH:
                print(
                    f"    skipping — branch {branch!r} != {GATED_BRANCH!r} "
                    "(only main deploys are gated on CI)"
                )
                continue

            if current is True:
                print("    already gated — no change needed")
                continue

            if not apply:
                print(f"    [DRY] would set checkSuites=True on trigger {trigger_id}")
                continue

            # Railway's deploymentTriggerUpdate returns DeploymentTrigger!, so the
            # mutation MUST select at least one subfield or the API rejects it with
            # GRAPHQL_VALIDATION_FAILED ("must have a selection of subfields").
            mutation = """
            mutation GateOnCI($id: String!, $input: DeploymentTriggerUpdateInput!) {
                deploymentTriggerUpdate(id: $id, input: $input) { id }
            }
            """
            gql(
                mutation,
                {
                    "id": trigger_id,
                    "input": {
                        "branch": branch,
                        "checkSuites": True,
                    },
                },
                token,
            )
            print(f"    set checkSuites=True on trigger {trigger_id}")

    if not any_trigger_found:
        print(
            "  WARNING: No deployment triggers found for any target service.\n"
            "  This is expected if the services have not yet been connected to a\n"
            "  GitHub repo in the Railway dashboard. Connect them first, then\n"
            "  re-run this script with --apply to activate the CI gate."
        )


def remove_worker_public_domain(token: str, apply: bool) -> None:
    """Delete the worker's pointless public domain (workers do no HTTP)."""
    query = """
    query WorkerDomains($serviceId: String!) {
        service(id: $serviceId) {
            serviceInstances {
                edges {
                    node {
                        domains {
                            serviceDomains { id domain }
                        }
                    }
                }
            }
        }
    }
    """
    data = gql(query, {"serviceId": TARGET["worker"]["id"]}, token)
    domains: list[dict] = []
    try:
        for edge in data["service"]["serviceInstances"]["edges"]:
            domains.extend(edge["node"]["domains"]["serviceDomains"] or [])
    except (KeyError, TypeError):
        domains = []

    if not domains:
        print("  no worker service domains to remove")
        return

    mutation = """
    mutation DeleteDomain($id: String!) {
        serviceDomainDelete(id: $id)
    }
    """
    for d in domains:
        if not apply:
            print(f"  [DRY] would delete worker service domain {d['domain']} ({d['id']})")
        else:
            gql(mutation, {"id": d["id"]}, token)
            print(f"  deleted worker service domain {d['domain']}")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Apply the methodex Railway service topology (replicas, "
            "healthchecks, drain settings, beat service creation, worker "
            "domain cleanup, CI-gate via checkSuites). "
            "Defaults to dry-run; pass --apply to mutate."
        ),
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the plan without mutating Railway. This is the default.",
    )
    group.add_argument(
        "--apply",
        action="store_true",
        help="Actually apply the changes to Railway. Without this flag, "
             "the script is read-only.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    # Default to dry-run unless --apply is passed.
    apply = args.apply

    token = os.environ.get("RAILWAY_API_TOKEN")
    if not token:
        print("ERROR: RAILWAY_API_TOKEN env var required", file=sys.stderr)
        print(
            "Hint: export RAILWAY_API_TOKEN=$(cat ~/.railway/config.json | "
            "python3 -c 'import json,sys; print(json.load(sys.stdin)[\"user\"][\"token\"])')",
            file=sys.stderr,
        )
        return 2

    if apply:
        print("APPLY MODE — Railway will be mutated.\n", flush=True)
    else:
        print("DRY-RUN MODE — pass --apply to commit changes to Railway.\n", flush=True)

    try:
        env_id = get_production_environment_id(token)
        services = list_services(token)
        print(f"Project: {PROJECT_ID}")
        print(f"Environment: production ({env_id})")
        print(f"Existing services: {[s['name'] for s in services]}\n")

        # 1. Ensure beat service exists
        print("==> Step 1: ensure beat service exists")
        beat_id = ensure_beat_service_exists(token, services, env_id, apply)
        if beat_id:
            TARGET["beat"]["id"] = beat_id

        # 2. Apply topology to each known service
        print("\n==> Step 2: apply topology to each service")
        for name, cfg in TARGET.items():
            if cfg["id"] is None:
                print(
                    f"Skipping {name} — no service id "
                    "(was it just created above? if dry-run, that's expected)"
                )
                continue
            updates: dict[str, Any] = {}
            if "numReplicas" in cfg:
                updates["numReplicas"] = cfg["numReplicas"]
            if cfg.get("healthcheckPath") is not None:
                updates["healthcheckPath"] = cfg["healthcheckPath"]
            if "healthcheckTimeout" in cfg:
                updates["healthcheckTimeout"] = cfg["healthcheckTimeout"]
            if "drainingSeconds" in cfg:
                updates["drainingSeconds"] = cfg["drainingSeconds"]

            if updates:
                print(f"Updating {name} ({cfg['id']}):")
                update_service_instance(token, cfg["id"], env_id, updates, apply)

        # 3. Remove worker's public domain
        print("\n==> Step 3: remove worker public domain")
        remove_worker_public_domain(token, apply)

        # 4. Gate auto-deploy on GitHub check suites (CI must pass before Railway deploys)
        #
        # Railway's DeploymentTrigger.checkSuites=True is the "Wait for CI" toggle.
        # When enabled, Railway holds the auto-deploy in WAITING until every GitHub
        # check suite on the pushed commit concludes successfully — which means
        # GitHub Actions (backend-ci, frontend-ci) must pass first. If any suite
        # fails, the deployment is SKIPPED.
        #
        # IMPORTANT: ci.yml must NEVER contain a job that waits for the Railway
        # deployment — that would deadlock (the deployment can't start until the
        # check suite completes, and the suite can't complete while a job waits
        # for the deployment). Post-deploy failure handling is Railway-side:
        # healthcheck + ON_FAILURE restart policy. Only main-branch triggers are
        # gated; see enable_check_suites_gate and
        # docs/production-readiness/runbooks/deploy-gating.md.
        print("\n==> Step 4: gate auto-deploy on GitHub check suites (Wait for CI)")
        gated_service_ids = [
            TARGET["backend"]["id"],
            TARGET["worker"]["id"],
        ]
        gated_service_names = ["backend", "worker"]
        enable_check_suites_gate(
            token, env_id, gated_service_ids, gated_service_names, apply
        )

        if apply:
            print("\nDone — Railway has been updated.")
        else:
            print("\nDry-run complete. Re-run with --apply to commit.")
        return 0
    except RuntimeError as exc:
        print(f"\nFAILED: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
