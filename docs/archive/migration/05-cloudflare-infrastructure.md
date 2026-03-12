# 05 - Cloudflare Infrastructure

This guide covers setting up Cloudflare as the infrastructure layer: domain registration, DNS, frontend hosting via Cloudflare Pages, and security/caching configuration. Cloudflare's free tier covers nearly everything here.

**Prerequisites:** You have a Cloudflare account (free tier is sufficient for all of this).

---

## 1. Domain Registration

### Option A: Buy via Cloudflare Registrar (Recommended)
Cloudflare Registrar sells domains at wholesale cost with no markup. WHOIS privacy is included for free.

1. Log into Cloudflare Dashboard
2. Go to **Domain Registration > Register Domains**
3. Search for your domain name
4. Purchase (pay annually)

**Recommended TLDs for a research tool:**
- `.dev` -- signals a development/tech tool, enforces HTTPS by default (HSTS preloaded)
- `.app` -- similar HTTPS enforcement, clean look
- `.io` -- popular for tools, slightly more expensive
- `.com` -- if available, universally recognized

**Cost estimate:** ~$10-15/year for `.dev` or `.app`

### Option B: Transfer an Existing Domain
If you already own a domain elsewhere:
1. Unlock the domain at your current registrar
2. Get the authorization/EPP code
3. In Cloudflare: **Domain Registration > Transfer Domains**
4. Enter your domain and auth code
5. Transfer takes 5-7 days

### Decision needed: What domain name to use?
Pick something short and descriptive. Examples: `5d-research.dev`, `qualresearch.app`, `fiveD.dev`.

---

## 2. DNS Configuration

### Add Domain to Cloudflare
If you bought through Cloudflare Registrar, this is automatic. If transferring or using external registrar:
1. **Websites > Add a site** in Cloudflare Dashboard
2. Enter your domain
3. Select the Free plan
4. Cloudflare scans existing DNS records
5. Update nameservers at your registrar to the ones Cloudflare provides

### Architecture Decision: Subdomain vs Path Routing

You need to decide how the frontend and backend are accessed.

#### Option A: Subdomain Routing (Recommended)
```
yourdomain.com        --> Cloudflare Pages (frontend)
api.yourdomain.com    --> Railway backend
```

**Pros:**
- Clean separation of concerns
- Each service has its own origin (simpler CORS)
- Cloudflare Pages handles the root domain natively
- Independent scaling and deployment
- Browser treats them as separate origins (security benefit)

**Cons:**
- Requires CORS configuration (cross-origin requests from frontend to API)
- Two DNS records to manage
- Cookies need explicit `domain` attribute if shared

#### Option B: Path-Based Routing
```
yourdomain.com        --> Cloudflare Pages (frontend)
yourdomain.com/api/*  --> Railway backend (via Cloudflare Worker or redirect rule)
```

**Pros:**
- Same origin means no CORS needed
- Simpler cookie handling

**Cons:**
- Requires a Cloudflare Worker or complex Page Rules to route `/api/*` to Railway
- Adds a proxy hop and latency
- More complex deployment and debugging
- Cloudflare Workers have request limits on free tier (100K/day -- likely fine, but a constraint)

**Recommendation:** Go with **subdomain routing** (Option A). The CORS configuration is straightforward and already partially implemented in the codebase (`ALLOWED_ORIGINS` in `config.py`). It is simpler to set up and debug.

### DNS Records to Create

Navigate to **DNS > Records** in your Cloudflare Dashboard.

#### For subdomain routing (Option A):

| Type | Name | Target | Proxy | TTL |
|------|------|--------|-------|-----|
| CNAME | `@` (root) | Cloudflare Pages auto-configures this | Orange cloud | Auto |
| CNAME | `api` | `your-app.up.railway.app` | Orange cloud | Auto |

Notes:
- The root domain record is managed automatically when you connect a custom domain to Cloudflare Pages (see Section 3)
- The `api` CNAME points to your Railway deployment URL
- **Orange cloud = proxy enabled** -- this gives you Cloudflare's DDoS protection, CDN, and SSL termination

#### For path routing (Option B):

| Type | Name | Target | Proxy | TTL |
|------|------|--------|-------|-----|
| CNAME | `@` (root) | Cloudflare Pages auto-configures this | Orange cloud | Auto |

You would then need a Cloudflare Worker to proxy `/api/*` requests to Railway. This is more complex and not recommended.

### SSL/TLS Configuration

1. Go to **SSL/TLS > Overview**
2. Set mode to **Full (strict)**
   - This means Cloudflare encrypts traffic to your origin AND validates the origin's certificate
   - Railway provides valid SSL certificates, so strict mode works
3. Go to **SSL/TLS > Edge Certificates**
   - Enable **Always Use HTTPS** (redirects HTTP to HTTPS)
   - Enable **Automatic HTTPS Rewrites** (fixes mixed content in page resources)
   - Set **Minimum TLS Version** to TLS 1.2

---

## 3. Cloudflare Pages Setup (Frontend Hosting)

Cloudflare Pages hosts static sites with automatic builds from GitHub. The free tier includes unlimited bandwidth and 500 builds per month.

### Connect to GitHub

1. Go to **Workers & Pages > Create application > Pages**
2. Click **Connect to Git**
3. Authorize Cloudflare to access your GitHub repository
4. Select the `qualitative-research-tool` repository

### Build Configuration

| Setting | Value |
|---------|-------|
| Production branch | `main` |
| Framework preset | None (leave blank or select Vite if available) |
| Build command | `cd frontend && npm install && npm run build` |
| Build output directory | `frontend/dist` |
| Root directory | `/` (repository root) |

**Why `cd frontend && npm install && npm run build`?**
The frontend lives in a subdirectory. The build command from `package.json` is `tsc -b && vite build` (invoked by `npm run build`), which runs TypeScript compilation then Vite bundling.

**Important:** If Pages supports setting Root Directory to `frontend/`, use that instead and simplify the build command to `npm install && npm run build` with output directory `dist`.

### Environment Variables

Set these in **Settings > Environment Variables** for the Pages project:

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_VERSION` | `20` | Pages uses Node 18 by default; the project needs 20+ |
| `VITE_API_URL` | `https://api.yourdomain.com` | Backend API URL (used at build time by Vite) |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_...` or `pk_test_...` | Clerk frontend key (safe to expose, it is a publishable key) |

**Vite environment variables:** Any variable prefixed with `VITE_` is embedded into the frontend bundle at build time. They are NOT secret -- they are visible in the browser. Only put publishable/public values here.

You can set different values for **Production** vs **Preview** environments:
- Production: `VITE_API_URL` = `https://api.yourdomain.com`
- Preview: `VITE_API_URL` = `https://api.yourdomain.com` (same, unless you have a staging backend)

### Custom Domain

1. In your Pages project, go to **Custom domains**
2. Click **Set up a custom domain**
3. Enter `yourdomain.com`
4. Cloudflare auto-creates the necessary DNS record
5. Optionally add `www.yourdomain.com` and set up a redirect from `www` to the apex domain

### Preview Deployments

Cloudflare Pages automatically creates preview URLs for every branch and pull request:
- Push to `main` --> deploys to `yourdomain.com`
- Push to `feature-branch` --> deploys to `feature-branch.your-project.pages.dev`

This is useful for testing frontend changes before merging. Preview URLs are shareable.

### Build Triggers

By default, Pages auto-deploys on every push to the production branch. You can customize this:
- **Settings > Builds & Deployments > Build watch paths**: Set to `frontend/**` so that backend-only changes do not trigger a frontend rebuild.

---

## 4. Cloudflare R2 Setup (Overview)

R2 is Cloudflare's S3-compatible object storage. Detailed setup is covered in the storage migration guide (03-storage-r2-migration.md). Here is the quick summary for infrastructure context.

### Create the Bucket

1. Go to **R2 Object Storage > Create bucket**
2. Bucket name: `qualitative-research-videos` (or similar)
3. Location: Automatic (Cloudflare picks the nearest region)

### Generate API Tokens

1. Go to **R2 Object Storage > Manage R2 API Tokens**
2. Create a token with:
   - Permission: **Object Read & Write**
   - Scope: Specific bucket (the one you just created)
3. Save the Access Key ID and Secret Access Key -- these replace the old AWS credentials in your backend `.env`

### CORS Configuration

The R2 bucket needs CORS rules so that presigned URLs work from the browser. Configure via the dashboard or the S3-compatible API:

```json
[
  {
    "AllowedOrigins": ["https://yourdomain.com"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

**See:** `03-storage-r2-migration.md` for the full migration walkthrough including code changes.

---

## 5. Cloudflare Security Features (Free Tier)

Cloudflare's free tier includes a surprising amount of security. Here is what you get and what to enable.

### DDoS Protection
- **Automatic** when the proxy is enabled (orange cloud on DNS records)
- No configuration needed
- Covers L3/L4 and L7 attacks

### WAF (Web Application Firewall)
- Free tier includes **Cloudflare Managed Ruleset**
- Go to **Security > WAF > Managed Rules**
- Enable the Cloudflare Managed Ruleset
- This blocks common attack patterns (SQLi, XSS, path traversal)
- Review the ruleset; the defaults are sensible for most applications

### Bot Management
- Basic bot protection is included on free tier
- Go to **Security > Bots**
- Enable **Bot Fight Mode** (blocks known bad bots)
- This is useful for preventing automated abuse of your API

### Rate Limiting
- Free tier includes 1 rate limiting rule
- Go to **Security > WAF > Rate limiting rules**
- Suggested rule for the API subdomain:

```
If: hostname equals "api.yourdomain.com"
   AND URI path contains "/api/videos"
   AND request method equals "POST"
Then: Block for 10 minutes
When: Rate exceeds 20 requests per minute per IP
```

This protects expensive endpoints (upload, analysis) without affecting normal browsing. You will also want rate limiting in the FastAPI application itself (covered in 06-operations-security.md) for more granular control.

### Security Headers

You can add security headers via **Rules > Transform Rules > Modify Response Header**:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage |

**Note:** `Strict-Transport-Security` (HSTS) can be enabled directly in **SSL/TLS > Edge Certificates > HTTP Strict Transport Security**. Recommended settings: `max-age=31536000; includeSubDomains`.

`Content-Security-Policy` is best set in the application or via a Cloudflare Transform Rule. For a React app using Vite, a reasonable starting point:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.cloudflare.com; connect-src 'self' https://api.yourdomain.com https://clerk.yourdomain.com https://*.clerk.accounts.dev; font-src 'self';
```

Adjust `connect-src` to include all domains the frontend talks to (your API, Clerk, AssemblyAI if called directly, etc.).

---

## 6. Caching Strategy

### Static Assets (Cloudflare Pages)
- Cloudflare Pages **automatically** caches and serves static assets (JS, CSS, images, fonts) from its global CDN
- Vite generates content-hashed filenames (`index-abc123.js`), so assets are safely cacheable forever
- No configuration needed -- this just works

### API Responses (Railway Backend)
- API responses should generally **NOT** be cached by Cloudflare
- By default, Cloudflare does not cache responses with `Set-Cookie` or responses to authenticated requests
- To be safe, set these headers on your Railway backend responses:

```
Cache-Control: no-store, no-cache, must-revalidate
```

This is already the default behavior for FastAPI JSON responses, but it is worth verifying.

**Exception:** If you have truly static API endpoints (e.g., a list of supported models, feature flags), you could cache them. Create a Cache Rule in Cloudflare:

```
If: hostname equals "api.yourdomain.com" AND URI path equals "/api/models"
Then: Cache with Edge TTL of 1 hour
```

This is optional and probably not worth the complexity for a small research tool.

### R2 Video Files
- Videos are served via **presigned URLs** directly from R2
- The presigned URL includes an expiration, so caching behavior is limited by the URL lifetime
- R2 sets reasonable default cache headers
- If videos are large and accessed frequently, Cloudflare's CDN cache can help reduce egress -- but R2 egress is already free, so this is a performance optimization, not a cost one

### What NOT to Cache
- Any response that contains user-specific data (analysis results, transcripts, project lists)
- Any response behind authentication
- POST/PUT/DELETE responses (Cloudflare does not cache these by default)

---

## Quick Reference: Free Tier Limits

| Feature | Free Tier Limit | Likely Usage |
|---------|----------------|--------------|
| Cloudflare Pages builds | 500/month | ~10-20/month |
| Pages bandwidth | Unlimited | Well within limits |
| R2 storage | 10 GB/month free | 11 videos = ~3.2 GB |
| R2 Class A operations (writes) | 1M/month | Minimal (few uploads) |
| R2 Class B operations (reads) | 10M/month | Video playback, well within |
| R2 egress | Free (always) | No limit |
| DNS queries | Unlimited | No limit |
| SSL certificates | Unlimited | Automatic |
| DDoS protection | Unlimited | Automatic |
| WAF managed rules | Included | Automatic |
| Rate limiting rules | 1 rule | Enough for API protection |

---

## Checklist

- [ ] **Decision:** Choose a domain name and TLD
- [ ] **Decision:** Subdomain routing (`api.` prefix) or path routing (`/api` prefix) -- subdomain recommended
- [ ] Register or transfer domain in Cloudflare
- [ ] Add domain to Cloudflare (if not auto-added via Registrar)
- [ ] Set SSL/TLS to Full (strict)
- [ ] Enable Always Use HTTPS
- [ ] Enable HSTS
- [ ] Create `api` CNAME record pointing to Railway
- [ ] Set up Cloudflare Pages project connected to GitHub
- [ ] Configure Pages build settings and environment variables
- [ ] Connect custom domain to Pages
- [ ] Set build watch path to `frontend/**`
- [ ] Create R2 bucket and API tokens (see 03-storage-r2-migration.md)
- [ ] Enable Bot Fight Mode
- [ ] Enable WAF Managed Ruleset
- [ ] Create rate limiting rule for API
- [ ] Add security headers via Transform Rules
- [ ] Verify frontend loads on custom domain
- [ ] Verify API is reachable at `api.yourdomain.com`
- [ ] Test CORS: frontend can call the API without errors
