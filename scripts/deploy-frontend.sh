#!/usr/bin/env bash
# Deploy frontend to Cloudflare Pages with production environment variables.
# This script exists because CF Pages uses direct upload (no build on CF),
# so we must inject production env vars at build time — the local .env file
# has dev/test keys that must NOT reach production.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/../frontend"

echo "Building frontend with PRODUCTION environment..."
cd "$FRONTEND_DIR"

VITE_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsubWV0aG9kZXguYWkk \
VITE_API_URL=https://api-production-df43.up.railway.app \
VITE_CLERK_PROXY_URL=/__clerk \
  npm run build

# Verify correct key was baked in
if grep -q 'pk_test_Zm' dist/assets/index-*.js 2>/dev/null; then
  echo "ERROR: Build contains pk_test_ key! Aborting deploy."
  exit 1
fi

echo "Deploying to Cloudflare Pages..."
npx wrangler pages deploy dist/ \
  --project-name=methodex-frontend \
  --branch=main \
  --commit-dirty=true

echo "Deploy complete!"
