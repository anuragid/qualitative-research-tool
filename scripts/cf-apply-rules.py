#!/usr/bin/env python3
"""
Apply Cloudflare WAF custom rules, DNS hardening, and Logpush for methodex.ai.

Requires a scoped API token in CF_API_TOKEN env var. Generate one at:
    https://dash.cloudflare.com/profile/api-tokens
with these scopes:
    - Zone:Zone WAF:Edit             (for custom rules + rate limit rules)
    - Zone:DNS:Edit                  (for CAA, SPF, DMARC, MX records)
    - Zone:Zone Settings:Edit
    - Account:Logs:Edit              (for Logpush jobs to R2)
    - Account:Cloudflare R2:Edit     (for Logpush destination auth)
Restrict the token to zone: methodex.ai (and the methodex account for the
account-level scopes).

Run:
    # Default: dry-run only (safe, read-only)
    CF_API_TOKEN=... python3 scripts/cf-apply-rules.py [--r2-bucket methodex-logs]

    # Explicit dry-run (same as default)
    CF_API_TOKEN=... python3 scripts/cf-apply-rules.py --dry-run [--r2-bucket methodex-logs]

    # Actually apply changes to the live zone
    CF_API_TOKEN=... python3 scripts/cf-apply-rules.py --apply [--r2-bucket methodex-logs]

This script is idempotent: it checks whether each rule/record exists before
creating it, and skips existing ones. Safe to run multiple times.

Design notes:
- Uses curl for HTTPS because system Python 3.13 on macOS has intermittent
  SSL cert verification issues with urllib.
- Uses only the Python stdlib. No pip installs.
- All writes require --apply flag; GET reads still run in both modes
  so the user can see current state before committing.
- The script continues past partial failures, accumulates them, and exits
  non-zero at the end if any step failed. No single failure crashes the run.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from typing import Any


# methodex.ai zone — replace if forking. These are identifiers, not secrets.
ZONE_ID = "b55ab8d3aaec6ba9c4d0d4c7512e20bb"
ACCOUNT_ID = "aa9c79d742b2b63253d0d22fc3d03da6"
ZONE_NAME = "methodex.ai"
DEFAULT_R2_BUCKET = "methodex-logs"

CF_API = "https://api.cloudflare.com/client/v4"

# Required token scopes printed when CF_API_TOKEN is missing or invalid.
REQUIRED_SCOPES = [
    "Zone:Zone WAF:Edit",
    "Zone:DNS:Edit",
    "Zone:Zone Settings:Edit",
    "Account:Logs:Edit",
    "Account:Cloudflare R2:Edit  (for Logpush to R2)",
]


# ---------------------------------------------------------------------------
# HTTP transport via curl
# ---------------------------------------------------------------------------


class CFError(Exception):
    """Raised when a Cloudflare API call fails."""


def cf_request(
    method: str,
    path: str,
    token: str,
    body: dict[str, Any] | list[Any] | None = None,
) -> dict[str, Any]:
    """Make a CF API call via curl. Returns parsed JSON.

    Raises CFError on non-success responses with the CF error JSON.
    """
    url = path if path.startswith("http") else f"{CF_API}{path}"
    args = [
        "curl",
        "-sS",
        "-X",
        method,
        "-H",
        f"Authorization: Bearer {token}",
        "-H",
        "Content-Type: application/json",
        url,
    ]
    if body is not None:
        args.extend(["--data", json.dumps(body)])
    try:
        result = subprocess.run(args, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as e:
        raise CFError(f"curl failed ({e.returncode}): {e.stderr}") from e
    try:
        parsed = json.loads(result.stdout)
    except json.JSONDecodeError as e:
        raise CFError(f"non-JSON response from CF: {result.stdout[:400]}") from e
    if not parsed.get("success", False):
        errors = parsed.get("errors", [])
        raise CFError(f"CF API error: {json.dumps(errors)}")
    return parsed


def cf_get(path: str, token: str) -> dict[str, Any]:
    return cf_request("GET", path, token)


def cf_post(
    path: str, token: str, body: dict[str, Any], dry_run: bool
) -> dict[str, Any] | None:
    if dry_run:
        print(f"    [dry-run] would POST {path}")
        print(f"    [dry-run] body: {json.dumps(body, indent=2)[:500]}")
        return None
    return cf_request("POST", path, token, body)


def cf_put(
    path: str, token: str, body: dict[str, Any], dry_run: bool
) -> dict[str, Any] | None:
    if dry_run:
        print(f"    [dry-run] would PUT {path}")
        print(f"    [dry-run] body: {json.dumps(body, indent=2)[:500]}")
        return None
    return cf_request("PUT", path, token, body)


def cf_patch(
    path: str, token: str, body: dict[str, Any], dry_run: bool
) -> dict[str, Any] | None:
    if dry_run:
        print(f"    [dry-run] would PATCH {path}")
        print(f"    [dry-run] body: {json.dumps(body, indent=2)[:500]}")
        return None
    return cf_request("PATCH", path, token, body)


# ---------------------------------------------------------------------------
# State accumulators
# ---------------------------------------------------------------------------


class Report:
    def __init__(self) -> None:
        self.created: list[str] = []
        self.skipped: list[str] = []
        self.failed: list[tuple[str, str]] = []
        self.todos: list[str] = []

    def create(self, label: str) -> None:
        self.created.append(label)
        print(f"    -> CREATED: {label}")

    def skip(self, label: str, reason: str = "already exists") -> None:
        self.skipped.append(label)
        print(f"    -> SKIP: {label} ({reason})")

    def fail(self, label: str, reason: str) -> None:
        self.failed.append((label, reason))
        print(f"    -> FAIL: {label} -- {reason}")

    def todo(self, msg: str) -> None:
        self.todos.append(msg)
        print(f"    -> TODO: {msg}")

    def print_summary(self) -> None:
        print()
        print("=" * 72)
        print("Summary")
        print("=" * 72)
        print(f"  created: {len(self.created)}")
        for x in self.created:
            print(f"    + {x}")
        print(f"  skipped: {len(self.skipped)}")
        for x in self.skipped:
            print(f"    = {x}")
        print(f"  failed:  {len(self.failed)}")
        for label, reason in self.failed:
            print(f"    ! {label}: {reason}")
        if self.todos:
            print(f"  todos:   {len(self.todos)}")
            for x in self.todos:
                print(f"    * {x}")


# ---------------------------------------------------------------------------
# Preflight and token verification
# ---------------------------------------------------------------------------


def preflight_token() -> str | None:
    """Return the token if present and non-trivially long, else None."""
    token = os.environ.get("CF_API_TOKEN", "").strip()
    if not token:
        print("ERROR: CF_API_TOKEN is not set.", file=sys.stderr)
        _print_token_help()
        return None
    if token.lower() in {"dummy", "placeholder", "todo", "changeme"}:
        print(f"ERROR: CF_API_TOKEN looks like a placeholder: {token!r}", file=sys.stderr)
        _print_token_help()
        return None
    if len(token) < 20:
        print(
            f"ERROR: CF_API_TOKEN looks too short ({len(token)} chars); "
            "real CF tokens are ~40 chars.",
            file=sys.stderr,
        )
        _print_token_help()
        return None
    return token


def _print_token_help() -> None:
    print("", file=sys.stderr)
    print("Generate a scoped token at:", file=sys.stderr)
    print("  https://dash.cloudflare.com/profile/api-tokens", file=sys.stderr)
    print("", file=sys.stderr)
    print("Required scopes:", file=sys.stderr)
    for scope in REQUIRED_SCOPES:
        print(f"  - {scope}", file=sys.stderr)
    print("", file=sys.stderr)
    print(f"Restrict to zone: {ZONE_NAME}", file=sys.stderr)
    print("", file=sys.stderr)
    print("Then run:", file=sys.stderr)
    print("  CF_API_TOKEN=... python3 scripts/cf-apply-rules.py [--dry-run]", file=sys.stderr)


def verify_token(token: str, report: Report) -> bool:
    """GET /user/tokens/verify. Returns True if token is valid."""
    try:
        data = cf_get("/user/tokens/verify", token)
    except CFError as e:
        report.fail("token verification", str(e))
        return False
    status = data.get("result", {}).get("status", "?")
    token_id = data.get("result", {}).get("id", "?")
    print(f"    token id: {token_id}")
    print(f"    status:   {status}")
    return status == "active"


# ---------------------------------------------------------------------------
# Ruleset helpers (custom rules + rate limit rules)
# ---------------------------------------------------------------------------


def get_or_create_entrypoint_ruleset(
    phase: str, token: str, dry_run: bool
) -> str | None:
    """Return the ruleset id for the zone's entrypoint ruleset for `phase`.

    CF exposes an "entry point" ruleset per phase per zone. For custom WAF
    rules the phase is `http_request_firewall_custom`; for rate limits it's
    `http_ratelimit`. We GET the entrypoint; if it doesn't exist yet, we PUT
    an empty one to create it.
    """
    path = f"/zones/{ZONE_ID}/rulesets/phases/{phase}/entrypoint"
    try:
        data = cf_get(path, token)
        return data["result"]["id"]
    except CFError as e:
        # Entry point may not exist yet — create it with an empty rules array.
        err = str(e).lower()
        if "not found" in err or "does not exist" in err or "10024" in err or "10039" in err:
            if dry_run:
                print(f"    [dry-run] would create entrypoint ruleset for phase={phase}")
                return "DRYRUN-ENTRYPOINT-ID"
            body = {
                "name": f"default-{phase}",
                "kind": "zone",
                "description": f"methodex entrypoint ruleset for {phase}",
                "rules": [],
            }
            try:
                data = cf_put(path, token, body, dry_run=False)
                return data["result"]["id"] if data else None
            except CFError as e2:
                print(f"    failed to create entrypoint: {e2}")
                return None
        print(f"    failed to get entrypoint: {e}")
        return None


def list_rules(ruleset_id: str, token: str) -> list[dict[str, Any]]:
    """Return the list of rules currently in the ruleset, or []."""
    if ruleset_id == "DRYRUN-ENTRYPOINT-ID":
        return []
    try:
        data = cf_get(f"/zones/{ZONE_ID}/rulesets/{ruleset_id}", token)
        return data.get("result", {}).get("rules") or []
    except CFError:
        return []


def rule_exists(rules: list[dict[str, Any]], description: str) -> dict[str, Any] | None:
    for r in rules:
        if r.get("description") == description:
            return r
    return None


def add_rule_to_ruleset(
    ruleset_id: str,
    rule_body: dict[str, Any],
    token: str,
    dry_run: bool,
) -> dict[str, Any] | None:
    """POST a rule to an existing ruleset."""
    path = f"/zones/{ZONE_ID}/rulesets/{ruleset_id}/rules"
    return cf_post(path, token, rule_body, dry_run)


# ---------------------------------------------------------------------------
# Rule definitions
# ---------------------------------------------------------------------------

RULE_CLI_UA = {
    "description": "methodex: block CLI user agents on SPA hosts",
    "expression": (
        '(http.host in {"methodex.ai" "www.methodex.ai"} and '
        '(http.user_agent contains "curl/" or '
        'http.user_agent contains "wget/" or '
        'http.user_agent contains "python-requests/" or '
        'http.user_agent contains "Go-http-client/" or '
        'http.user_agent contains "libwww-perl"))'
    ),
    "action": "block",
    "enabled": True,
}

RULE_SECRETS_PATHS = {
    "description": "methodex: block secrets exposure paths",
    "expression": (
        '(http.request.uri.path contains ".env" or '
        'http.request.uri.path contains ".git/" or '
        'http.request.uri.path contains "wp-config" or '
        'http.request.uri.path contains "wp-admin" or '
        'http.request.uri.path contains "wp-login" or '
        'http.request.uri.path contains "phpinfo" or '
        'http.request.uri.path contains "/.aws" or '
        'http.request.uri.path contains "id_rsa" or '
        'http.request.uri.path contains "sendgrid_keys" or '
        'http.request.uri.path contains "config.php" or '
        'http.request.uri.path eq "/xmlrpc.php")'
    ),
    "action": "block",
    "enabled": True,
}

RULE_URL_ENCODED_EVASION = {
    "description": "methodex: block URL-encoded path evasion",
    "expression": (
        '(http.request.uri.path contains "%2e%2e" or '
        'http.request.uri.path contains "%2f/" or '
        'http.request.uri.path matches "^/%[0-9a-fA-F]{2}")'
    ),
    "action": "block",
    "enabled": True,
}

RULE_SCANNER_UA = {
    "description": "methodex: block scanner UAs",
    "expression": (
        '(http.user_agent contains "Palo Alto Networks" or '
        'http.user_agent contains "zgrab" or '
        'http.user_agent contains "masscan" or '
        'http.user_agent contains "nuclei" or '
        'http.user_agent contains "nikto")'
    ),
    "action": "block",
    "enabled": True,
}

CUSTOM_RULES = [RULE_CLI_UA, RULE_SECRETS_PATHS, RULE_URL_ENCODED_EVASION, RULE_SCANNER_UA]


# Rate-limit rule uses a different schema — characteristics + period etc.
RULE_API_RATE_LIMIT = {
    "description": "methodex: api rate limit safety net",
    "expression": '(http.host eq "api.methodex.ai" and not cf.client.bot)',
    "action": "block",
    "ratelimit": {
        "characteristics": ["cf.colo.id", "ip.src"],
        "period": 10,
        "requests_per_period": 60,
        "mitigation_timeout": 60,
    },
    "enabled": True,
}


# ---------------------------------------------------------------------------
# DNS records to add
# ---------------------------------------------------------------------------


def _caa(flags: int, tag: str, value: str, comment: str) -> dict[str, Any]:
    return {
        "type": "CAA",
        "name": ZONE_NAME,
        "data": {"flags": flags, "tag": tag, "value": value},
        "comment": comment,
        "ttl": 1,
    }


DNS_RECORDS: list[dict[str, Any]] = [
    _caa(0, "issue", "letsencrypt.org", "methodex: allow LE for Railway custom domain"),
    _caa(0, "issue", "pki.goog", "methodex: allow Google Trust Services (CF Pages)"),
    _caa(0, "issuewild", ";", "methodex: disallow wildcard issuance"),
    # NOTE: replace the email below if you have a real security contact.
    # Uncomment to enable iodef reporting.
    # _caa(0, "iodef", "mailto:security@methodex.ai", "methodex: CAA violation reports"),
    {
        "type": "TXT",
        "name": ZONE_NAME,
        "content": '"v=spf1 -all"',
        "comment": "methodex: no mail sent from apex",
        "ttl": 1,
    },
    {
        "type": "TXT",
        "name": f"_dmarc.{ZONE_NAME}",
        "content": '"v=DMARC1; p=reject; adkim=s; aspf=s"',
        "comment": "methodex: reject all mail, strict alignment",
        "ttl": 1,
    },
    {
        "type": "MX",
        "name": ZONE_NAME,
        "content": ".",
        "priority": 0,
        "comment": "methodex: null MX (RFC 7505) — does not accept mail",
        "ttl": 1,
    },
]


def _describe_record(rec: dict[str, Any]) -> str:
    t = rec["type"]
    n = rec["name"]
    if t == "CAA":
        d = rec["data"]
        return f'{t} {n} {d["flags"]} {d["tag"]} "{d["value"]}"'
    if t == "MX":
        return f'{t} {n} pri={rec.get("priority", 0)} {rec["content"]}'
    return f'{t} {n} {rec["content"]}'


def _records_match(existing: dict[str, Any], desired: dict[str, Any]) -> bool:
    """Loose content match. CF normalizes TXT/CAA content in several ways."""
    if existing.get("type") != desired["type"]:
        return False
    if existing.get("name") != desired["name"]:
        return False
    t = desired["type"]
    if t == "CAA":
        d = desired["data"]
        ed = existing.get("data", {}) or {}
        return (
            ed.get("tag") == d["tag"]
            and ed.get("value") == d["value"]
            and int(ed.get("flags", -1)) == int(d["flags"])
        )
    if t == "MX":
        return (
            str(existing.get("content", "")).rstrip(".") == desired["content"].rstrip(".")
            and int(existing.get("priority", -1)) == int(desired.get("priority", 0))
        )
    if t == "TXT":
        # CF strips the surrounding quotes in the stored content field.
        want = desired["content"].strip().strip('"')
        got = str(existing.get("content", "")).strip().strip('"')
        return want == got
    return existing.get("content") == desired.get("content")


def list_dns_records(token: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    page = 1
    while True:
        data = cf_get(
            f"/zones/{ZONE_ID}/dns_records?per_page=100&page={page}", token
        )
        res = data.get("result", []) or []
        out.extend(res)
        info = data.get("result_info", {}) or {}
        if page >= int(info.get("total_pages", 1) or 1):
            break
        page += 1
    return out


# ---------------------------------------------------------------------------
# Step runners
# ---------------------------------------------------------------------------


def step_custom_rules(token: str, dry_run: bool, report: Report) -> None:
    print("[3/9] Ensuring custom WAF ruleset entrypoint...")
    ruleset_id = get_or_create_entrypoint_ruleset(
        "http_request_firewall_custom", token, dry_run
    )
    if ruleset_id is None:
        report.fail("custom ruleset entrypoint", "could not get or create")
        return
    print(f"    ruleset: {ruleset_id}")

    existing = list_rules(ruleset_id, token)
    print(f"    {len(existing)} existing rule(s) in entrypoint")

    for i, rule in enumerate(CUSTOM_RULES, start=1):
        label = rule["description"]
        print(f"[4.{i}] Rule: {label}")
        if rule_exists(existing, label):
            report.skip(label)
            continue
        try:
            add_rule_to_ruleset(ruleset_id, rule, token, dry_run)
            report.create(label)
        except CFError as e:
            report.fail(label, str(e))


def step_rate_limit_rule(token: str, dry_run: bool, report: Report) -> None:
    print("[5/9] Ensuring rate-limit ruleset entrypoint...")
    ruleset_id = get_or_create_entrypoint_ruleset("http_ratelimit", token, dry_run)
    if ruleset_id is None:
        report.fail("rate-limit ruleset entrypoint", "could not get or create")
        return
    print(f"    ruleset: {ruleset_id}")

    existing = list_rules(ruleset_id, token)
    print(f"    {len(existing)} existing rate-limit rule(s)")

    label = RULE_API_RATE_LIMIT["description"]
    print(f"[5.1] Rule: {label}")
    if rule_exists(existing, label):
        report.skip(label)
        return
    try:
        add_rule_to_ruleset(ruleset_id, RULE_API_RATE_LIMIT, token, dry_run)
        report.create(label)
    except CFError as e:
        report.fail(label, str(e))


def step_dns_records(token: str, dry_run: bool, report: Report) -> None:
    print("[6/9] Fetching current DNS records...")
    try:
        existing = list_dns_records(token)
    except CFError as e:
        report.fail("dns list", str(e))
        existing = []
    print(f"    {len(existing)} records in zone")

    for i, rec in enumerate(DNS_RECORDS, start=1):
        label = _describe_record(rec)
        print(f"[7.{i}] DNS: {label}")
        # Check for a matching existing record.
        match = next((e for e in existing if _records_match(e, rec)), None)
        if match:
            report.skip(label)
            continue
        try:
            cf_post(f"/zones/{ZONE_ID}/dns_records", token, rec, dry_run)
            report.create(label)
        except CFError as e:
            report.fail(label, str(e))


def step_logpush(
    token: str, dry_run: bool, r2_bucket: str, report: Report
) -> None:
    """Create a Logpush job to R2 for the http_requests dataset.

    R2 Logpush requires an R2-ownership challenge on first setup. The CF API
    accepts the job creation request but the job will be in a "not yet
    validated" state until the user completes the ownership token in the
    dashboard. For simplicity and robustness we create the job skeleton when
    possible and always emit a TODO pointing the user at the dashboard.
    """
    print(f"[8/9] Logpush to R2 bucket '{r2_bucket}'...")
    # Check existing jobs so we don't duplicate.
    try:
        data = cf_get(f"/zones/{ZONE_ID}/logpush/jobs", token)
        jobs = data.get("result", []) or []
    except CFError as e:
        report.fail("logpush list", str(e))
        return

    existing_job = next(
        (j for j in jobs if (j.get("name") or "").startswith("methodex-http-4xx5xx")),
        None,
    )
    if existing_job:
        report.skip(
            "logpush job methodex-http-4xx5xx",
            f"id={existing_job.get('id')}",
        )
        return

    # R2 destination format:
    #   r2://<bucket>/<prefix>?account-id=<account-id>
    # The access key and secret are set out-of-band via the ownership
    # challenge; we do not put credentials in the destination URL.
    destination = (
        f"r2://{r2_bucket}/methodex-logs/{{DATE}}?account-id={ACCOUNT_ID}"
    )
    job_body = {
        "name": "methodex-http-4xx5xx",
        "dataset": "http_requests",
        "destination_conf": destination,
        "enabled": True,
        "logpull_options": (
            "fields=RayID,EdgeStartTimestamp,ClientIP,ClientRequestHost,"
            "ClientRequestMethod,ClientRequestURI,EdgeResponseStatus,"
            "ClientRequestUserAgent,ClientCountry,SecurityAction,"
            "SecurityRuleDescription&timestamps=rfc3339"
        ),
        "filter": '{"where":{"key":"EdgeResponseStatus","operator":"geq","value":"400"}}',
        "frequency": "high",
    }

    try:
        cf_post(f"/zones/{ZONE_ID}/logpush/jobs", token, job_body, dry_run)
        report.create(f"logpush job to r2://{r2_bucket}")
    except CFError as e:
        # R2 Logpush almost always requires a separate ownership challenge
        # flow before the POST succeeds. Don't crash — emit a TODO.
        msg = str(e)
        report.fail("logpush job create", msg)
        report.todo(
            "Logpush to R2 usually requires an ownership challenge on first "
            "setup. Finish in the dash: Analytics & Logs -> Logs -> Push jobs "
            "-> Add job -> R2. Use dataset=http_requests, filter "
            "EdgeResponseStatus>=400, bucket=" + r2_bucket
        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    group = p.add_mutually_exclusive_group()
    group.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the plan without mutating Cloudflare. This is the default.",
    )
    group.add_argument(
        "--apply",
        action="store_true",
        help="Actually apply changes to the live Cloudflare zone. Without this flag, "
             "the script is read-only.",
    )
    p.add_argument(
        "--r2-bucket",
        default=os.environ.get("METHODEX_R2_LOG_BUCKET", DEFAULT_R2_BUCKET),
        help=f"R2 bucket for Logpush (default: {DEFAULT_R2_BUCKET})",
    )
    p.add_argument(
        "--skip-logpush",
        action="store_true",
        help="Skip the Logpush step entirely.",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    report = Report()

    # Default to dry-run unless --apply is passed.
    apply = args.apply
    dry_run = args.dry_run or (not args.apply and not args.dry_run)

    print(f"cf-apply-rules.py — zone={ZONE_NAME} ({ZONE_ID})")
    print(f"account={ACCOUNT_ID}")
    print(f"mode={'APPLY' if apply else 'DRY-RUN'}")
    print(f"r2-bucket={args.r2_bucket}")
    print("-" * 72)
    sys.stdout.flush()

    # Step 1: preflight the env var.
    print("[1/9] Checking CF_API_TOKEN...")
    sys.stdout.flush()
    token = preflight_token()
    if token is None:
        return 1
    print("    token present")

    # Step 2: verify the token works (unless it's obviously fake and we're
    # in dry-run, in which case we still attempt but continue gracefully).
    print("[2/9] Verifying token against CF API...")
    try:
        ok = verify_token(token, report)
    except Exception as e:
        report.fail("token verification", f"unexpected: {e}")
        ok = False
    if not ok:
        if dry_run:
            print("    token verification failed; continuing in dry-run mode")
            print("    (no writes will be issued; GETs will likely also fail)")
        else:
            print("ERROR: token verification failed; refusing to proceed.", file=sys.stderr)
            _print_token_help()
            report.print_summary()
            return 2

    # Wrap each step individually so one failure doesn't abort the rest.
    for step_fn, name in [
        (lambda: step_custom_rules(token, dry_run, report), "custom rules"),
        (lambda: step_rate_limit_rule(token, dry_run, report), "rate limit"),
        (lambda: step_dns_records(token, dry_run, report), "dns records"),
    ]:
        try:
            step_fn()
        except Exception as e:
            report.fail(name, f"unexpected exception: {e}")

    if not args.skip_logpush:
        try:
            step_logpush(token, dry_run, args.r2_bucket, report)
        except Exception as e:
            report.fail("logpush", f"unexpected exception: {e}")
    else:
        print("[8/9] Logpush: skipped (--skip-logpush)")

    print("[9/9] Done.")
    report.print_summary()

    # Non-zero exit if anything failed, so CI/CD can notice.
    return 3 if report.failed else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\ninterrupted", file=sys.stderr)
        sys.exit(130)
