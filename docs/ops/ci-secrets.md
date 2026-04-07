# CI Secrets

GitHub Actions secrets required by `.github/workflows/ci.yml`:

| Secret | Purpose | How to obtain |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Deploy frontend to Cloudflare Pages | Cloudflare dashboard → My Profile → API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account selection | Cloudflare dashboard, right sidebar |
| `VITE_CLERK_PUBLISHABLE_KEY` | Production Clerk key (pk_live_…) | Clerk dashboard → API Keys |
| `VITE_API_URL` | `https://api.methodex.ai` | Static |
| `VITE_CLERK_PROXY_URL` | `/__clerk` (reverse-proxy path) | Static |
| `VITE_SENTRY_DSN` | Frontend Sentry DSN | Sentry project settings |
| `SENTRY_AUTH_TOKEN` | Source-map upload | Sentry account → auth tokens |
| `RAILWAY_API_TOKEN` | Railway GraphQL token for deploy-wait job | Railway dashboard → Account → Tokens (workspace-scoped) |

To rotate a secret, create a new one in the dashboard, update the GitHub
Actions secret, then revoke the old one.
