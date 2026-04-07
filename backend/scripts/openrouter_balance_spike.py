"""OpenRouter balance-endpoint spike script.

Used to ground-truth the response shape of OpenRouter's key/credits
endpoints before building the BalanceInfo dataclass, DB migration, and
balance fetching service on top of unverified assumptions.

Run locally with a real key to verify/re-verify the shape:

    OPENROUTER_API_KEY=sk-or-v1-... python backend/scripts/openrouter_balance_spike.py

Verified 2026-04-06 results are persisted in the implementation plan
(see /Users/idstuart/.claude/plans/abstract-spinning-mountain.md,
section "Phase 0 results").  Re-run this script when debugging balance
issues or when OpenRouter changes their API.
"""

from __future__ import annotations

import json
import os
import sys

import httpx

ENDPOINTS = [
    ("GET /api/v1/auth/key", "https://openrouter.ai/api/v1/auth/key"),
    ("GET /api/v1/key", "https://openrouter.ai/api/v1/key"),
    ("GET /api/v1/credits", "https://openrouter.ai/api/v1/credits"),
]


def spike(api_key: str) -> None:
    for label, url in ENDPOINTS:
        print("=" * 72)
        print(label)
        print("=" * 72)
        try:
            r = httpx.get(
                url,
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=15,
            )
        except httpx.HTTPError as e:
            print(f"NETWORK ERROR: {e}")
            continue
        print(f"status     : {r.status_code}")
        print(f"content-type: {r.headers.get('content-type')}")
        try:
            print("body       :")
            print(json.dumps(r.json(), indent=2))
        except Exception:
            print(f"body (raw) : {r.text[:2000]}")
        print()


def main() -> int:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        print("ERROR: OPENROUTER_API_KEY env var is required", file=sys.stderr)
        return 2
    spike(key)
    return 0


if __name__ == "__main__":
    sys.exit(main())
