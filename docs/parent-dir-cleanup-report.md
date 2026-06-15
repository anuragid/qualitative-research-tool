# Parent Directory Cleanup Report — `5d-analysis/`

**Generated:** 2026-06-14
**Scope:** `/Users/idstuart/Projects/ai-prototyping/5d-analysis/` (the directory that *contains* this repo)
**Mode:** REPORT ONLY — nothing was deleted. The parent directory is **NOT a git repository**, so any deletion there is unrecoverable. Review before running anything.

---

## Critical context first

- The **only live subdirectory** in the parent is `qualitative-research-tool/` (this repo, ~1.0 GB working tree incl. node_modules/.venv). Everything else in the parent is a candidate for cleanup.
- `videos-backup/` (3.2 GB, 11 research videos) and `analysis-backup/` (3.3 MB, v1/v2 analysis JSON) were **intentionally preserved by the user** per project memory. They are classified **KEEP / ARCHIVE** below and must **never** be casually deleted. They are the irreplaceable research corpus.
- The parent `.claude/` directory holds the user's **live auto-memory** (`MEMORY.md` and point-in-time references) plus `settings.local.json`. **KEEP.**
- The app migrated **OFF AWS Cognito ONTO Clerk**. All `cognito-*` and `test_cognito_*` files in the parent are abandoned migration scaffolding. Verified: no live code in `qualitative-research-tool/backend` or `/frontend` reads any of these parent-level files. (`USE_COGNITO_AUTH=False` lives inside the app's own `.env`, and `app/auth_bridge.py` is an *in-repo* file — neither depends on the parent cognito artifacts.)
- The frontend deploys via **Cloudflare Pages through GitHub Actions** (`qualitative-research-tool/.github/workflows/ci.yml`), not Vercel. The parent `.vercel/`, the `.gitignore` (whose sole line is `.vercel`), and the 3-byte `package.json` / `package-lock.json` stubs are all leftovers from an **abandoned Vercel + npm scaffolding** attempt in the parent.

---

## Full inventory

| Path | Size | Last modified | What it is | Recommendation | Why |
|------|------|---------------|------------|----------------|-----|
| `qualitative-research-tool/` | 1.0 GB | live | The actual app repo (FastAPI+Celery / React+Vite). | **KEEP** | The live product. Only LIVE subdir. |
| `videos-backup/` | 3.2 GB | 2025-11 (files) | 11 research interview videos (`video-01..11`, ~60–451 MB each). | **KEEP / ARCHIVE** | Irreplaceable research corpus; user deliberately preserved. DB can be regenerated from these. If space is needed, move to cold/external storage — do not delete. |
| `analysis-backup/` | 3.3 MB | 2026-03-23 | v1 (`agentic-analysis-synthesis`) + v2 (`v2-aas`) analysis JSON/txt outputs. | **KEEP / ARCHIVE** | User-preserved historical analysis data. Small; safe to keep in place or archive. |
| `.claude/` | 28 KB | 2026-06-12 | Live Claude config: `settings.local.json`, `hooks/`, `skills/`, and `projects/.../memory/` (the auto-memory `MEMORY.md` index). | **KEEP** | Active config + the persistent project memory referenced by MEMORY.md. |
| `CLAUDE.md` | 615 B | 2026-04-06 | Project-wide Claude guidance (verification standards, workflow, CI rules). | **KEEP** | Active instructions that override defaults. |
| `test-audio-interview.mp3` | 18 MB | 2026-03-19 | A single test audio interview clip. | **KEEP (review)** | Plausible transcription test fixture. Not referenced by app code, but small and likely useful for manual AssemblyAI testing. Keep unless user confirms it is throwaway. |
| `brand-inspiration/` | 181 MB | 2026-03-12 | 19 large PNG mood-board / inspiration screenshots (`image 1.png` … `image 19.png`, up to 19 MB each). | **ARCHIVE** | Design mood board, not used by the app. Biggest non-research consumer of space (181 MB). Move to design archive / external storage rather than keep in the working tree. Safe to delete if the user has them elsewhere. |
| `methodex-craft-site/` | 16 MB | 2026-03-25 | Old "Craft"-style marketing site experiment: `index.html` (88 KB) + `craft-assets/` + several analysis `.md` files. | **DELETE** | Abandoned brand/marketing-site experiment. Superseded; not part of the live app. The canonical design reference now lives in `frontend/docs/` + memory. |
| `methodex-acctual-site/` | 7.2 MB | 2026-03-25 | Old "Acctual"-style marketing site experiment: `index.html` (43 KB) + 73 image assets. | **DELETE** | Abandoned brand/marketing-site experiment (note the typo "acctual" in the dir name). Not part of the live app. |
| `AUDIT_REPORT.md` | 16 KB | 2025-12-02 | "Comprehensive Codebase Audit Report" (Dec 2025) — 78 issues. | **DELETE** | Superseded by the 2026-06 20-PR hardening campaign + `docs/production-readiness/`. Historical; findings already addressed/captured in-repo. |
| `PARENT_DIRECTORY_AUDIT.md` | 6.6 KB | 2025-11-19 | A *prior* parent-dir audit (Nov 2024-dated header) recommending archiving old guides. | **DELETE** | An earlier version of *this very report*. Now superseded by `docs/parent-dir-cleanup-report.md`. |
| `UI_REDESIGN_SUMMARY.md` | 7.9 KB | 2025-11-24 | Summary of a VideoDetailPage UI redesign. | **DELETE** | Stale design note from Nov 2025; the UI has moved on. Belongs in repo history if at all, not loose in the parent. |
| `CLERK_TO_COGNITO_MIGRATION.md` | 5.4 KB | 2025-11-24 | Guide for migrating Clerk → Cognito. | **DELETE** | Abandoned migration direction. The app went the *opposite* way (Cognito → Clerk). Misleading dead doc. |
| `cognito-config.md` | 846 B | 2025-11-24 | AWS Cognito user-pool config notes (pool ID, client ID, ARNs). | **DELETE** | Abandoned Cognito setup. Also contains a real AWS user-pool ID / account number — stale and should not linger loose. |
| `cognito-setup.json` | 2.3 KB | 2025-11-24 | Cognito setup payload. | **DELETE** | Abandoned Cognito migration artifact. |
| `cognito-admin-permissions.json` | 829 B | 2025-11-24 | Cognito admin IAM permissions JSON. | **DELETE** | Abandoned Cognito migration artifact. |
| `cognito-permissions-policy.json` | 600 B | 2025-11-24 | Cognito permissions policy JSON. | **DELETE** | Abandoned Cognito migration artifact. |
| `test_cognito_auth.py` | 4.4 KB | 2025-11-24 | Python script to auth against Cognito (uses `boto3`, hardcoded pool ID). | **DELETE** | Tests the abandoned Cognito path. Not part of the app test suite. |
| `test_cognito_localhost.sh` | 5.0 KB | 2025-11-24 | Shell script testing Cognito auth endpoints on localhost. | **DELETE** | Tests the abandoned Cognito path. |
| `logo-preview.html` | 16 KB | 2026-03-15 | Standalone HTML logo/brand preview page. | **DELETE** | One-off brand preview; not wired into the app. Superseded by the finalized "methodex" brand. |
| `.vercel/` | 8 KB | 2025-11-24 | `project.json` (Vercel project/org IDs) + README — from an abandoned Vercel deploy attempt. | **DELETE** | App deploys via Cloudflare Pages (GitHub Actions), not Vercel. Dead deploy config. |
| `.wrangler/` | 16 KB | 2026-03-23 | Wrangler local cache (`cache/pages.json`, `wrangler-account.json`, `tmp/`). | **DELETE** | Regenerable Cloudflare Wrangler cache created by running wrangler from the parent. Pure cache, no source. |
| `node_modules/` | 32 KB | 2026-06-12 | NOT real packages — only stray tool caches: `.vite-temp/`, `.cache/storybook/`, `.cache/wrangler/`. | **DELETE** | Empty-of-packages cache shell created by tools run from the parent dir. Regenerable. |
| `package.json` | 3 B | 2025-11-24 | Literally `{}` — a stub. | **DELETE** | Empty stub from the abandoned parent-level npm scaffolding. |
| `package-lock.json` | 90 B | 2025-11-24 | Empty lockfile (`"packages": {}`). | **DELETE** | Empty stub paired with the package.json stub. |
| `.gitignore` | 8 B | 2025-11-24 | Single line: `.vercel`. | **DELETE** | The parent is not a git repo, so this `.gitignore` does nothing. Leftover from the Vercel scaffolding. |
| `worktrees/` | 0 B | 2026-04-06 | Empty directory. | **DELETE** | Empty. Stale placeholder; the real worktrees live under `qualitative-research-tool/.claude/worktrees/`. |
| `5d-worktrees/` | 0 B | 2026-06-13 | Empty directory. | **DELETE** | Empty. Stale placeholder (same reason as `worktrees/`). |
| `.agents/` | 92 KB | 2026-03-13 | `skills/shadcn` — a vendored shadcn skill snapshot. | **DELETE (review)** | Duplicated by `skills-lock.json` + the in-repo/global shadcn skill. Not referenced by the app. Low-risk delete; keep only if the user relies on this exact pinned snapshot. |
| `skills-lock.json` | 208 B | 2026-03-13 | Lockfile pinning the `shadcn` skill (hash). | **DELETE (review)** | Pairs with `.agents/skills`. Same reasoning — stale vendored-skill bookkeeping. Delete with `.agents/` or keep both together. |
| `.vscode/` | 4 KB | 2025-11-20 | `settings.json` (editor settings) for the parent folder. | **KEEP (review)** | Harmless editor config. Keep if the user opens `5d-analysis/` as a VS Code workspace; otherwise trivially deletable. |
| `.mcp.json` | 112 B | 2026-03-27 | MCP server config (registers the Sentry HTTP MCP). | **KEEP (review)** | Live-ish MCP config used when running tooling from the parent. Tiny; keep unless the user only uses the in-repo `.mcp.json`. |
| `.DS_Store` | 12 KB | 2026-03-28 | macOS Finder metadata. | **DELETE** | OS cruft. Always regenerable. |

> Note: there are additional `.DS_Store` files nested inside `analysis-backup/` and `.wrangler/`. Those go away naturally if you delete `.wrangler/`, and inside `analysis-backup/` it is harmless OS cruft you may remove without touching the data.

---

## "Safe to delete now" summary

These are confidently dead weight with **no** live dependency. Deleting all of them is safe and reclaims **~204 MB** (the bulk of it `methodex-craft-site/` + `methodex-acctual-site/`; the cognito/audit/doc files are tiny but are stale/misleading and one contains a real AWS pool ID).

**Definitely dead (no caveats):**
- Cognito migration scaffolding: `cognito-admin-permissions.json`, `cognito-config.md`, `cognito-permissions-policy.json`, `cognito-setup.json`, `CLERK_TO_COGNITO_MIGRATION.md`, `test_cognito_auth.py`, `test_cognito_localhost.sh`
- Stale audit/design docs: `AUDIT_REPORT.md`, `PARENT_DIRECTORY_AUDIT.md`, `UI_REDESIGN_SUMMARY.md`, `logo-preview.html`
- Abandoned marketing-site experiments: `methodex-acctual-site/`, `methodex-craft-site/`
- Abandoned Vercel/npm scaffolding + caches: `.vercel/`, `.wrangler/`, `node_modules/`, `package.json`, `package-lock.json`, `.gitignore`
- Empty stale dirs: `worktrees/`, `5d-worktrees/`
- OS cruft: `.DS_Store`

**Reclassify, don't auto-delete (caveats above):**
- `brand-inspiration/` (181 MB) → **ARCHIVE** to external storage (biggest space win, but it is design source material)
- `.agents/` + `skills-lock.json` → vendored shadcn skill snapshot; delete only if you don't rely on the pinned hash
- `.vscode/`, `.mcp.json`, `test-audio-interview.mp3` → small, possibly still useful; keep unless confirmed throwaway

**Never delete (research / live config):**
- `qualitative-research-tool/`, `videos-backup/`, `analysis-backup/`, `.claude/`, `CLAUDE.md`

---

## Copy-pasteable cleanup block (run yourself, after review)

> The parent dir is **not** under version control — these deletions are **permanent**. Prefer `trash` (recoverable to macOS Trash) over `rm`. Run from inside the parent dir.

```bash
cd /Users/idstuart/Projects/ai-prototyping/5d-analysis

# --- Option A: macOS Trash (recoverable) — requires `brew install trash` ---
trash \
  cognito-admin-permissions.json cognito-config.md \
  cognito-permissions-policy.json cognito-setup.json \
  CLERK_TO_COGNITO_MIGRATION.md test_cognito_auth.py test_cognito_localhost.sh \
  AUDIT_REPORT.md PARENT_DIRECTORY_AUDIT.md UI_REDESIGN_SUMMARY.md logo-preview.html \
  methodex-acctual-site methodex-craft-site \
  .vercel .wrangler node_modules package.json package-lock.json .gitignore \
  worktrees 5d-worktrees .DS_Store

# --- Option B: permanent rm (NO undo) — only if you're sure ---
# rm -rf \
#   cognito-admin-permissions.json cognito-config.md \
#   cognito-permissions-policy.json cognito-setup.json \
#   CLERK_TO_COGNITO_MIGRATION.md test_cognito_auth.py test_cognito_localhost.sh \
#   AUDIT_REPORT.md PARENT_DIRECTORY_AUDIT.md UI_REDESIGN_SUMMARY.md logo-preview.html \
#   methodex-acctual-site methodex-craft-site \
#   .vercel .wrangler node_modules package.json package-lock.json .gitignore \
#   worktrees 5d-worktrees .DS_Store
```

Optional, after deciding the caveated items:

```bash
# Archive the 181 MB design mood board to external storage instead of deleting:
#   mv brand-inspiration /Volumes/<external>/methodex-archive/brand-inspiration
# Drop the vendored shadcn skill snapshot if you don't rely on the pinned hash:
#   trash .agents skills-lock.json
```

**Do NOT** include in any delete command: `qualitative-research-tool/`, `videos-backup/`, `analysis-backup/`, `.claude/`, `CLAUDE.md`.
