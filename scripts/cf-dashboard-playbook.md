# Cloudflare dashboard playbook — methodex.ai

For items that can't be applied via the API (Free plan limitations) or that
need human judgment. Companion to `scripts/cf-apply-rules.py`, which
automates custom WAF rules, rate-limit rules, DNS hardening, and Logpush.

## Prerequisites

- Account access: https://dash.cloudflare.com/ (use your admin login)
- Zone: `methodex.ai`
- Zone ID and Account ID are hardcoded in `scripts/cf-apply-rules.py`
  (they are identifiers, not secrets).

## 1. Enable DNSSEC

**Why**: prevents DNS spoofing + validates the zone's signing chain.

1. Dashboard → select zone `methodex.ai` → **DNS** → **Settings**.
2. Scroll to **DNSSEC** → click **Enable DNSSEC**.
3. Copy the displayed DS record (algorithm, key tag, digest type, digest).
4. If the registrar is Cloudflare Registrar: no further action — DS is
   applied automatically.
5. If the registrar is external: paste the DS record into the registrar's
   DNSSEC config. Wait for propagation (up to 24h).
6. Return to the DNS Settings page and confirm status shows "DNSSEC is
   enabled".

Note: DNSSEC cannot be toggled via the Free-plan API.

## 2. Bot Fight Mode

**Why**: drops obviously-bot traffic at the edge before it eats CPU or
skews analytics.

1. Dashboard → zone → **Security** → **Bots**.
2. Toggle **Bot Fight Mode** to **On**.
3. Leave **Super Bot Fight Mode** off (Pro-plan feature).

Caveat: Bot Fight Mode may challenge curl/wget and other CLI tools. Our
companion script already blocks CLI UAs on SPA hosts but leaves them
allowed on `api.methodex.ai` for internal tooling, so this toggle is safe
to turn on.

## 3. Pages Access Policy for preview deployments

**Why**: preview subdomains on `*.methodex-frontend.pages.dev` are
permanently public by default and are a second attack surface.

1. Dashboard → **Workers & Pages** → **methodex-frontend** (or whichever
   Pages project serves the frontend).
2. **Settings** → **General** → scroll to **Access policy**.
3. Under **Preview deployments**, click **Configure** → **Require
   Cloudflare Access**.
4. Pick the Access application that restricts to your email(s); create one
   if none exists (Zero Trust → Access → Applications → Add → Self-hosted,
   domain `*.methodex-frontend.pages.dev`, policy: "Allow emails ending in
   @your-domain.edu" or specific list).
5. Leave **Production deployments** as **Public** — that's where real
   users land.

## 4. Verify zone security settings

All of these can be checked at a glance in **Security** → **Settings**.

1. **Security level**: `Medium`
2. **Challenge passage**: `30 minutes`
3. **Browser integrity check**: `On`
4. **Privacy pass support**: `On`

Then under **SSL/TLS** → **Edge Certificates**:

5. **Always Use HTTPS**: `On`
6. **Automatic HTTPS Rewrites**: `On`
7. **Minimum TLS Version**: `TLS 1.2` (or `1.3` if no legacy clients)
8. **HSTS**: already enabled with preload in the app; leave CF's HSTS
   toggle off to avoid double-setting the header.

## 5. Create scoped API token for cf-apply-rules.py

Only needed once, the first time you run the companion script.

1. Dashboard → **Profile** icon → **My Profile** → **API Tokens**.
2. **Create Token** → **Custom token**.
3. Name it: `methodex-apply-rules`.
4. **Permissions** — add each of:
   - Zone → **Zone WAF** → **Edit**
   - Zone → **DNS** → **Edit**
   - Zone → **Zone Settings** → **Edit**
   - Account → **Logs** → **Edit**
   - Account → **Cloudflare R2** → **Edit**  (for Logpush to R2)
5. **Zone Resources** → Include → Specific zone → `methodex.ai`.
6. **Account Resources** → Include → your methodex account.
7. **TTL** → leave as default or set an expiry.
8. **Continue to summary** → **Create Token**.
9. Copy the token immediately (shown once).
10. Run:
    ```bash
    export CF_API_TOKEN=<paste>
    python3 scripts/cf-apply-rules.py --dry-run
    ```
    then, if the dry-run output looks correct:
    ```bash
    python3 scripts/cf-apply-rules.py
    ```
11. Clear the token from your shell history when done:
    `unset CF_API_TOKEN` and `history -d <line>` if needed.

## 6. Complete R2 Logpush setup

If `cf-apply-rules.py` prints a Logpush TODO (R2 often needs an ownership
challenge on first setup), finish it here.

1. Dashboard → **Analytics & Logs** → **Logs** → **Push jobs**.
2. Click **Create a Logpush job** → choose dataset **HTTP requests**.
3. **Destination**: **R2**.
4. Pick the R2 bucket (default in the script is `methodex-logs`; create
   it first at **R2** → **Create bucket** if it doesn't exist yet).
5. **Prefix**: `methodex-logs/{DATE}`.
6. **Fields**: select at minimum
   `RayID, EdgeStartTimestamp, ClientIP, ClientRequestHost,
   ClientRequestMethod, ClientRequestURI, EdgeResponseStatus,
   ClientRequestUserAgent, ClientCountry, SecurityAction,
   SecurityRuleDescription`.
7. **Filter**: `EdgeResponseStatus >= 400` — only push error traffic to
   keep storage minimal.
8. **Frequency**: High.
9. **Submit** → complete the R2 ownership challenge when prompted.
10. Back in terminal, re-run `python3 scripts/cf-apply-rules.py` — the
    script will now see the existing job and skip.

## 7. After everything is applied

Sanity checks:

1. Run `python3 scripts/cf-traffic-report.py 1` → traffic still flowing,
   no unexplained drop in real-human pageviews.
2. Hit `https://methodex.ai/` from a normal browser → loads cleanly.
3. From terminal: `curl -I https://methodex.ai/` → should return 403 (the
   CLI-UA block rule).
4. From terminal: `curl -I https://api.methodex.ai/health` → should return
   200 (api host is exempt from CLI-UA block).
5. Dashboard → **Security** → **Events** → filter on the rule descriptions
   created by the script (`methodex: ...`) → confirm they fire on scanner
   traffic within ~10 minutes.

If any step regresses real traffic, disable the specific custom rule in
the dashboard (**Security** → **WAF** → **Custom rules** → toggle off) —
the script is idempotent and re-enabling it later is just a matter of
re-running.
