#!/usr/bin/env python3
"""
Clean traffic report for methodex.ai CF zone.

Unlike the raw CF dashboard, this separates:
  - Real browser pageviews (Chrome, Firefox, Safari, Edge, etc.)
  - Script/bot "pageviews" (Curl, Unknown, AppleBot, BingBot, GoogleBot, etc.)
  - Backend API traffic (identified by JSON content type)
  - Frontend traffic (identified by HTML content type)

Reads the CF OAuth token from the local wrangler install. Run with:
    python3 scripts/cf-traffic-report.py          # last 7 days
    python3 scripts/cf-traffic-report.py 30       # last 30 days
"""
import json
import os
import re
import subprocess
import sys
from datetime import date, timedelta

ZONE_ID = "b55ab8d3aaec6ba9c4d0d4c7512e20bb"
WRANGLER_CFG = os.path.expanduser(
    "~/Library/Preferences/.wrangler/config/default.toml"
)
GQL = "https://api.cloudflare.com/client/v4/graphql"

# UA families we consider "real human browsers" for pageview purposes.
HUMAN_UAS = {
    "Chrome", "Firefox", "Safari", "Edge", "Opera",
    "ChromeMobile", "MobileSafari", "SamsungInternet",
    "ChromeDerivative", "UCBrowserMobile", "MobileSafariWebview",
    "ChromeMobileWebview", "IE",
}
# Known bots and scripts — explicitly NOT human.
BOT_UAS = {
    "Curl", "Unknown", "ChromeHeadless",
    "AppleBot", "BingBot", "GoogleBot", "YandexBot", "DuckDuckBot",
    "BaiduSpider", "FacebookBot", "TwitterBot", "LinkedInBot",
}


def load_token() -> str:
    try:
        content = open(WRANGLER_CFG).read()
    except FileNotFoundError:
        sys.exit(
            f"error: wrangler config not found at {WRANGLER_CFG}. "
            f"Run `wrangler login` first."
        )
    m = re.search(r'oauth_token\s*=\s*"([^"]+)"', content)
    if not m:
        sys.exit("error: no oauth_token in wrangler config")
    return m.group(1)


def gql(query: str, token: str) -> dict:
    body = json.dumps({"query": query})
    result = subprocess.run(
        ["curl", "-sS",
         "-H", f"Authorization: Bearer {token}",
         "-H", "Content-Type: application/json",
         "--data", body, GQL],
        capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)


def fmt_int(n: int) -> str:
    return f"{n:,}"


def fmt_bytes(n: int) -> str:
    if n >= 1e9:
        return f"{n/1e9:.2f} GB"
    if n >= 1e6:
        return f"{n/1e6:.1f} MB"
    if n >= 1e3:
        return f"{n/1e3:.1f} KB"
    return f"{n} B"


def main() -> None:
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 7
    end = date.today()
    start = end - timedelta(days=days)
    since = start.isoformat()
    until = end.isoformat()

    token = load_token()

    # --- Pull daily totals + all the map breakdowns we need in one query. ---
    q = f'''
    {{
      viewer {{
        zones(filter: {{zoneTag: "{ZONE_ID}"}}) {{
          httpRequests1dGroups(
            limit: 60,
            filter: {{date_geq: "{since}", date_leq: "{until}"}},
            orderBy: [date_ASC]
          ) {{
            dimensions {{ date }}
            sum {{
              requests pageViews bytes threats
              browserMap {{ uaBrowserFamily pageViews }}
              contentTypeMap {{ edgeResponseContentTypeName requests bytes }}
              countryMap {{ clientCountryName requests threats }}
              ipClassMap {{ ipType requests }}
              responseStatusMap {{ edgeResponseStatus requests }}
            }}
            uniq {{ uniques }}
          }}
        }}
      }}
    }}'''
    data = gql(q, token)
    zones = data.get("data", {}).get("viewer", {}).get("zones", [])
    if not zones:
        sys.exit(f"error: no data returned. {data}")
    rows = zones[0]["httpRequests1dGroups"]

    # --- Aggregate. ---
    tot_reqs = tot_pvs = tot_bytes = tot_threats = tot_uniq = 0
    tot_html = tot_json = tot_other = 0
    human_pv = bot_pv = other_pv = 0
    country_reqs: dict[str, int] = {}
    country_threats: dict[str, int] = {}
    ip_class: dict[str, int] = {}
    status_counts: dict[str, int] = {}
    daily = []

    for r in rows:
        d = r["dimensions"]["date"]
        s = r["sum"]
        u = r["uniq"]["uniques"]
        tot_reqs += s["requests"]
        tot_pvs += s["pageViews"]
        tot_bytes += s["bytes"]
        tot_threats += s["threats"]
        tot_uniq += u

        # Content type
        day_html = day_json = 0
        for c in s["contentTypeMap"]:
            name = c["edgeResponseContentTypeName"]
            if name == "html":
                tot_html += c["requests"]
                day_html = c["requests"]
            elif name == "json":
                tot_json += c["requests"]
                day_json = c["requests"]
            else:
                tot_other += c["requests"]

        # Browser
        day_human = day_bot = day_other = 0
        for b in s["browserMap"]:
            fam = b["uaBrowserFamily"]
            pv = b["pageViews"]
            if fam in HUMAN_UAS:
                human_pv += pv
                day_human += pv
            elif fam in BOT_UAS:
                bot_pv += pv
                day_bot += pv
            else:
                other_pv += pv
                day_other += pv

        # Country
        for c in s["countryMap"]:
            country_reqs[c["clientCountryName"]] = (
                country_reqs.get(c["clientCountryName"], 0) + c["requests"]
            )
            country_threats[c["clientCountryName"]] = (
                country_threats.get(c["clientCountryName"], 0) + c["threats"]
            )

        # IP class
        for c in s["ipClassMap"]:
            ip_class[c["ipType"]] = ip_class.get(c["ipType"], 0) + c["requests"]

        # Status
        for c in s["responseStatusMap"]:
            k = str(c["edgeResponseStatus"])
            status_counts[k] = status_counts.get(k, 0) + c["requests"]

        daily.append({
            "date": d,
            "reqs": s["requests"],
            "pvs": s["pageViews"],
            "human_pv": day_human,
            "bot_pv": day_bot,
            "html": day_html,
            "json": day_json,
            "uniq": u,
            "bytes": s["bytes"],
            "threats": s["threats"],
        })

    # --- Render report. ---
    out = []
    p = out.append
    p(f"# methodex.ai traffic report — last {days} days ({since} → {until})")
    p("")
    p("## Headline numbers")
    p("")
    p(f"- **Real human browser pageviews**: {fmt_int(human_pv)}")
    p(f"- Script/bot pageviews (curl, crawlers, unknown UAs): {fmt_int(bot_pv)}")
    if other_pv:
        p(f"- Other pageviews (uncategorized UAs): {fmt_int(other_pv)}")
    p(f"- Total pageviews per CF (mixed): {fmt_int(tot_pvs)}")
    p(f"- Unique IPs: {fmt_int(tot_uniq)}")
    p(f"- Total requests (incl. API): {fmt_int(tot_reqs)}")
    p(f"- Total bandwidth: {fmt_bytes(tot_bytes)}")
    p(f"- Threats auto-blocked: {fmt_int(tot_threats)}")
    p("")
    p("### What each number means")
    p("")
    p("- **Human pageviews** is the answer to \"how many people visited methodex.ai\"")
    p("- **Total requests** includes `api.methodex.ai` backend API traffic, which is")
    p("  why the request count dwarfs the pageview count")
    p("- **HTML responses** are a proxy for frontend loads; **JSON responses** are a")
    p("  proxy for API traffic")
    p("")

    # Content split
    p("## Traffic split by content type")
    p("")
    p(f"- HTML (frontend): {fmt_int(tot_html)} requests")
    p(f"- JSON (API): {fmt_int(tot_json)} requests")
    p(f"- Other (assets, redirects, etc.): {fmt_int(tot_other)} requests")
    if tot_html + tot_json > 0:
        ratio = tot_json / max(tot_html, 1)
        p(f"- API:Frontend request ratio: **{ratio:.1f} : 1**")
    p("")

    # Daily table
    p("## Daily")
    p("")
    p("| Date | Humans | Bots/Scripts | Uniq IPs | Total reqs | HTML | JSON | Threats |")
    p("|---|---:|---:|---:|---:|---:|---:|---:|")
    for d in daily:
        p(
            f"| {d['date']} | {fmt_int(d['human_pv'])} | {fmt_int(d['bot_pv'])} | "
            f"{fmt_int(d['uniq'])} | {fmt_int(d['reqs'])} | {fmt_int(d['html'])} | "
            f"{fmt_int(d['json'])} | {fmt_int(d['threats'])} |"
        )
    p("")

    # Spike detection
    if daily:
        avg_reqs = sum(d["reqs"] for d in daily) / len(daily)
        spikes = [d for d in daily if d["reqs"] > avg_reqs * 3 and d["reqs"] > 5000]
        if spikes:
            p("## Spikes flagged (> 3× average, > 5,000 reqs)")
            p("")
            for d in spikes:
                ratio_to_pv = d["reqs"] / max(d["human_pv"], 1)
                p(
                    f"- **{d['date']}**: {fmt_int(d['reqs'])} requests "
                    f"({fmt_int(d['human_pv'])} humans, {fmt_bytes(d['bytes'])} bandwidth). "
                    f"Ratio: {ratio_to_pv:.0f} reqs per real pageview "
                    f"→ {'likely API abuse' if ratio_to_pv > 100 else 'check manually'}"
                )
            p("")

    # Top countries
    p("## Top countries by requests")
    p("")
    p("| Country | Requests | Threats | Threat rate |")
    p("|---|---:|---:|---:|")
    for c in sorted(country_reqs.items(), key=lambda x: -x[1])[:10]:
        name = c[0]
        reqs = c[1]
        thr = country_threats.get(name, 0)
        rate = f"{100 * thr / reqs:.2f}%" if reqs else "-"
        p(f"| {name} | {fmt_int(reqs)} | {fmt_int(thr)} | {rate} |")
    p("")

    # IP class
    p("## CF IP classification")
    p("")
    total_ip = sum(ip_class.values())
    for k, v in sorted(ip_class.items(), key=lambda x: -x[1]):
        pct = 100 * v / total_ip if total_ip else 0
        p(f"- {k}: {fmt_int(v)} ({pct:.1f}%)")
    p("")

    # Status codes
    p("## Response status codes")
    p("")
    for k, v in sorted(status_counts.items(), key=lambda x: -x[1])[:10]:
        p(f"- {k}: {fmt_int(v)}")
    p("")

    p("---")
    p("")
    p("Source: CF GraphQL API (`httpRequests1dGroups`). For frontend product")
    p("analytics (sessions, funnels, retention) see PostHog. For detailed")
    p("request-level forensics see CF dashboard → Security → Events.")

    print("\n".join(out))


if __name__ == "__main__":
    main()
