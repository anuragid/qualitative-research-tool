#!/usr/bin/env python3
"""Wait for a Railway backend deployment matching a given commit SHA to reach SUCCESS.

Used in GitHub Actions to block CI from reporting green until the backend is
actually live. Polls the Railway GraphQL API every 15 seconds for up to 10 minutes.

Environment variables:
- RAILWAY_API_TOKEN: workspace-scoped Railway API token (GitHub secret)
- RAILWAY_PROJECT_ID: Railway project id (default: methodex project id)
- RAILWAY_BACKEND_SERVICE_ID: backend service id
- COMMIT_SHA: the commit sha we're waiting for (usually $GITHUB_SHA)
"""

import os
import sys
import time
import json
import urllib.request
import urllib.error
import ssl

RAILWAY_API = "https://backboard.railway.app/graphql/v2"
POLL_INTERVAL_SECONDS = 15
MAX_WAIT_SECONDS = 600

QUERY = """
query DeploymentsForCommit($projectId: String!, $serviceId: String!) {
  deployments(
    first: 20
    input: { projectId: $projectId, serviceId: $serviceId }
  ) {
    edges {
      node {
        id
        status
        meta
        createdAt
      }
    }
  }
}
"""


def gql(query: str, variables: dict, token: str) -> dict:
    body = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    req = urllib.request.Request(
        RAILWAY_API,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        # Create context that allows self-signed certs for local testing
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(req, timeout=30, context=context) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode('utf-8', errors='replace')
        print(f"HTTP {e.code}: {error_msg}", file=sys.stderr)
        raise


def find_deployment_for_sha(token: str, project_id: str, service_id: str, sha: str):
    """Return (deployment_id, status) for the deployment matching the SHA, or (None, None)."""
    data = gql(QUERY, {"projectId": project_id, "serviceId": service_id}, token)
    if "errors" in data:
        print(f"GraphQL errors: {data['errors']}", file=sys.stderr)
        return None, None
    edges = (data.get("data") or {}).get("deployments", {}).get("edges", [])
    for edge in edges:
        node = edge.get("node", {})
        meta = node.get("meta") or {}
        commit = None
        if isinstance(meta, dict):
            commit = meta.get("commitHash") or meta.get("commit") or meta.get("sha")
        if commit and commit.startswith(sha[:7]):
            return node.get("id"), node.get("status")
    return None, None


def main():
    token = os.environ.get("RAILWAY_API_TOKEN")
    project_id = os.environ.get("RAILWAY_PROJECT_ID", "154d302f-8609-4897-a10c-1f0d5bfc4f06")
    service_id = os.environ.get("RAILWAY_BACKEND_SERVICE_ID", "2b70a900-042c-4083-b00b-0d01f3ece5dc")
    sha = os.environ.get("COMMIT_SHA") or os.environ.get("GITHUB_SHA")

    if not token:
        print("RAILWAY_API_TOKEN env var is required", file=sys.stderr)
        return 2
    if not sha:
        print("COMMIT_SHA (or GITHUB_SHA) env var is required", file=sys.stderr)
        return 2

    print(f"Waiting for Railway backend deployment of {sha[:7]} to reach SUCCESS...")

    start = time.monotonic()
    while time.monotonic() - start < MAX_WAIT_SECONDS:
        dep_id, status = find_deployment_for_sha(token, project_id, service_id, sha)
        if status is None:
            print(f"  [{int(time.monotonic() - start)}s] No deployment found yet for {sha[:7]}")
        elif status == "SUCCESS":
            print(f"  [{int(time.monotonic() - start)}s] Deployment {dep_id} SUCCESS")
            return 0
        elif status in ("FAILED", "CRASHED", "REMOVED"):
            print(f"  [{int(time.monotonic() - start)}s] Deployment {dep_id} {status} — aborting")
            return 1
        else:
            print(f"  [{int(time.monotonic() - start)}s] Deployment {dep_id} {status}, still waiting")
        time.sleep(POLL_INTERVAL_SECONDS)

    print(f"Timed out after {MAX_WAIT_SECONDS}s waiting for deployment", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
