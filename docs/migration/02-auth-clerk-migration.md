# Auth Migration: AWS Cognito to Clerk

This guide covers migrating the Qualitative Research Tool from AWS Cognito authentication to Clerk. It is written to be executable by a developer or an AI coding agent.

**Prerequisite:** The Cloudflare DNS/domain setup from `01-*` should be complete (or at least the production domain decided) before configuring Clerk's production instance.

---

## Table of Contents

1. [Current Auth Architecture](#1-current-auth-architecture)
2. [Clerk Account & Application Setup](#2-clerk-account--application-setup)
3. [Backend Migration](#3-backend-migration)
4. [Frontend Migration](#4-frontend-migration)
5. [Environment Variables](#5-environment-variables)
6. [User Management](#6-user-management)
7. [Testing](#7-testing)
8. [Cleanup Checklist](#8-cleanup-checklist)

---

## 1. Current Auth Architecture

### How It Works Today

The app uses an **auth bridge pattern** (`backend/app/auth_bridge.py`) that switches between Clerk and Cognito based on the `USE_COGNITO_AUTH` feature flag. Currently Cognito is active (`USE_COGNITO_AUTH=True`), but the original Clerk code still exists in the codebase.

### Key Files

| File | Purpose |
|------|---------|
| `backend/app/auth_bridge.py` | Router that delegates to Clerk or Cognito based on feature flag |
| `backend/app/auth.py` | **Original Clerk auth** -- `ClerkAuth` class with JWKS verification, RBAC |
| `backend/app/cognito_auth.py` | Cognito auth -- `CognitoAuth` class with JWKS verification, RBAC |
| `backend/app/config.py` | Settings with both Clerk and Cognito env vars |
| `backend/app/routes/users.py` | User sync endpoint (`/api/users/me`, `/api/users/sync`) |
| `backend/app/models/database_models.py` | `User` model with `String(255)` primary key |
| `frontend/src/main.tsx` | Wraps app in `CognitoAuthProvider` |
| `frontend/src/contexts/CognitoAuthContext.tsx` | Cognito auth context using AWS Amplify |
| `frontend/src/components/auth/CognitoSignIn.tsx` | Custom sign-in/sign-up/confirm UI |
| `frontend/src/config/cognito.ts` | Cognito pool config |
| `frontend/src/hooks/useAuth.ts` | Re-exports `useAuth` from Cognito context |
| `frontend/src/hooks/useUserSync.ts` | Calls `/api/users/sync` after login |
| `frontend/src/services/api.ts` | Axios interceptor attaches Cognito ID token |
| `frontend/src/components/Layout.tsx` | Header with manual user menu/sign-out |
| `frontend/src/App.tsx` | Route definitions with auth guards |

### Auth Flow (Current)

1. User signs in via `CognitoSignIn.tsx` (custom form)
2. AWS Amplify stores tokens locally
3. `api.ts` interceptor calls `fetchAuthSession()` to get the ID token
4. Token sent as `Authorization: Bearer {token}` on every API request
5. Backend `auth_bridge.py` routes to `cognito_auth.py`, which verifies via JWKS
6. `get_current_user()` returns `{id, email, role, permissions, raw_payload}`
7. Routes use `Depends(get_current_user)` or `Depends(get_current_user_id)`
8. On first login, `/api/users/sync` creates the user row in the `users` table

### Important Discovery: Original Clerk Code Exists

The file `backend/app/auth.py` contains a fully working `ClerkAuth` class that:
- Derives the JWKS URL from the Clerk publishable key
- Fetches and caches public keys
- Verifies JWTs with RS256
- Extracts role from `public_metadata.role` in the JWT payload
- Maps roles to permissions via `ROLE_PERMISSIONS`

The `auth_bridge.py` already has the Clerk import path wired up (lines 41-56). Setting `USE_COGNITO_AUTH=False` and providing valid Clerk credentials would reactivate it. **This is the fastest migration path.**

### Database Compatibility

The `users.id` column is `String(255)`. Cognito uses UUIDs like `a1b2c3d4-e5f6-...`. Clerk uses `user_xxxxxxxxxxxx`. Both are strings under 255 characters, so **no schema migration is needed**. However, any existing user rows from the Cognito era will be orphaned (new Clerk user IDs won't match old Cognito `sub` values). Since AWS has been decommissioned and the database can be regenerated from videos, this is acceptable.

---

## 2. Clerk Account & Application Setup

### 2.1 Create a Clerk Application

1. Go to [clerk.com](https://clerk.com) and create an account
2. Create a new application
3. Choose a name (e.g., "Qualitative Research Tool")
4. Clerk will create both a **Development** instance and a **Production** instance

### 2.2 Configure Authentication Methods

In the Clerk Dashboard under **User & Authentication > Email, Phone, Username**:

- **Email address**: Required (toggle on)
- **Password**: Required (toggle on)
- **Username**: Optional (toggle on if desired)
- **Phone number**: Optional (toggle off unless needed)

### 2.3 Social Login (Optional)

Under **User & Authentication > Social Connections**, optionally enable:

- **Google** -- requires Google OAuth credentials (Client ID + Secret)
- **GitHub** -- requires GitHub OAuth App credentials

These are entirely optional. Clerk handles the full OAuth flow; you just provide the credentials from each provider's developer console.

### 2.4 Configure Roles

Clerk supports roles via **Organizations** or via **public metadata** on user objects. For this app's simple admin/user/viewer model, **public metadata** is the simplest approach.

**Option A: Public Metadata (Recommended for this app)**

Set the role directly on each user's `publicMetadata`:

```json
{
  "role": "admin"
}
```

This can be set via:
- Clerk Dashboard: Users > select user > Public Metadata > Edit
- Clerk Backend API: `PATCH /users/{user_id}` with `public_metadata: { role: "admin" }`
- Clerk webhook: set default role on `user.created` event

The existing `auth.py` already reads from `public_metadata.role` (line 171):
```python
role = payload.get("role", payload.get("public_metadata", {}).get("role", "user"))
```

**Option B: Clerk Organizations (More complex, for multi-tenant)**

If the app needs to support multiple research teams, Clerk Organizations provide built-in role management. This is overkill for the current use case but could be adopted later.

### 2.5 Configure JWT Claims

In the Clerk Dashboard under **Sessions > Customize session token**:

Add a custom claims template so the JWT includes the user's role:

```json
{
  "role": "{{user.public_metadata.role}}",
  "email": "{{user.primary_email_address.email_address}}",
  "first_name": "{{user.first_name}}",
  "last_name": "{{user.last_name}}",
  "username": "{{user.username}}"
}
```

This ensures the backend can extract these fields directly from the JWT without making extra API calls to Clerk.

### 2.6 Configure Redirect URLs

In the Clerk Dashboard under **Paths > Redirect URLs**:

**Development:**
- `http://localhost:5173/` (Vite dev server)
- `http://localhost:3000/` (alternative)

**Production:**
- `https://yourdomain.com/` (your production domain)
- `https://yourdomain.com/sign-in`
- `https://yourdomain.com/projects`

### 2.7 Production Domain

**This is a hard dependency on DNS setup.**

In the Clerk Dashboard under **Domains** (Production instance):

1. Add your production domain (e.g., `research.yourdomain.com`)
2. Clerk will provide DNS records (CNAME) you must add to Cloudflare
3. Clerk needs the domain to be verified before the production instance works

Until the production domain is configured, use the Clerk **Development** instance for all work. Development instances use `*.clerk.accounts.dev` domains and do not require custom DNS.

### 2.8 Collect Your Keys

From the Clerk Dashboard under **API Keys**, note these values (do NOT commit them):

| Key | Where to Find | Format |
|-----|--------------|--------|
| Publishable Key | Dashboard > API Keys | `pk_test_...` (dev) or `pk_live_...` (prod) |
| Secret Key | Dashboard > API Keys | `sk_test_...` (dev) or `sk_live_...` (prod) |
| Webhook Signing Secret | Dashboard > Webhooks (after creating endpoint) | `whsec_...` |

---

## 3. Backend Migration

### 3.1 Strategy: Reactivate Existing Clerk Code

Since `backend/app/auth.py` already contains a working `ClerkAuth` implementation, the migration is primarily about:

1. Cleaning up the bridge pattern
2. Removing Cognito code
3. Updating `auth.py` to be the sole auth module
4. Optionally adding webhook support

### 3.2 Install/Verify Python Dependencies

The `requirements.txt` already has the needed packages:
- `PyJWT[crypto]==2.9.0` -- for JWT decoding with RS256
- `cryptography==45.0.0` -- for RSA key handling
- `httpx==0.28.1` -- for fetching JWKS

The previously commented-out `clerk-backend-api` SDK is **not required** for JWT verification. The existing `auth.py` uses raw JWKS verification, which is more lightweight and has no external SDK dependency. This is the preferred approach.

If you want Clerk's backend SDK for user management operations (creating users, updating metadata, etc.):
```
pip install clerk-backend-api
```

Add to `requirements.txt`:
```
clerk-backend-api>=1.0.0  # Optional: for Clerk user management API
```

### 3.3 Update `config.py`

Remove Cognito settings and the feature flag. Keep only Clerk settings.

**File:** `backend/app/config.py`

Remove these lines:
```python
# Authentication (AWS Cognito)
COGNITO_USER_POOL_ID: str = ""
COGNITO_APP_CLIENT_ID: str = ""
COGNITO_REGION: str = "us-east-1"

# Feature flag to switch between auth providers
USE_COGNITO_AUTH: bool = False
```

Update Clerk settings (remove "Deprecated" comment):
```python
# Authentication (Clerk)
CLERK_SECRET_KEY: str = ""
CLERK_PUBLISHABLE_KEY: str = ""
CLERK_JWT_KEY: str = ""  # Public key for JWT verification (optional, JWKS is preferred)
CLERK_WEBHOOK_SECRET: str = ""  # For Clerk webhook verification
```

The full `Settings` class auth section should look like:

```python
# Authentication (Clerk)
CLERK_SECRET_KEY: str = ""
CLERK_PUBLISHABLE_KEY: str = ""
CLERK_JWT_KEY: str = ""
CLERK_WEBHOOK_SECRET: str = ""
```

### 3.4 Promote `auth.py` to the Primary Auth Module

The existing `backend/app/auth.py` is already a complete Clerk auth module. It needs minor updates:

**3.4.1 Fix the `ClerkAuth.__init__` signature**

The `auth_bridge.py` (line 52-56) tries to construct `ClerkAuth` with explicit arguments:
```python
auth_handler = ClerkAuth(
    secret_key=settings.CLERK_SECRET_KEY,
    publishable_key=settings.CLERK_PUBLISHABLE_KEY,
    jwt_key=settings.CLERK_JWT_KEY,
)
```

But the current `auth.py` `ClerkAuth.__init__` takes no arguments (reads from `settings` directly). Since we are removing the bridge and using `auth.py` directly, this is fine. No changes needed to `ClerkAuth.__init__`.

**3.4.2 Add a `has_role` helper (missing from `auth.py`)**

The `auth_bridge.py` exports `has_role` but `auth.py` does not define it. Add this function to `auth.py`:

```python
def has_role(user: Dict[str, Any], role: UserRole) -> bool:
    """Check if a user has a specific role (or is admin)."""
    user_role = user.get("role", UserRole.USER.value)
    return user_role == role.value or user_role == UserRole.ADMIN.value
```

### 3.5 Delete the Bridge and Cognito Modules

Delete these files:
- `backend/app/auth_bridge.py`
- `backend/app/cognito_auth.py`

### 3.6 Update All Imports

Every file that imports from `auth_bridge` must be updated to import from `auth` instead.

**Files to update:**

1. `backend/app/routes/users.py` (line 10):
   ```python
   # Before:
   from app.auth_bridge import get_current_user, get_current_user_id

   # After:
   from app.auth import get_current_user, get_current_user_id
   ```

2. `backend/app/routes/projects.py` (line 18):
   ```python
   # Before:
   from app.auth_bridge import get_current_user_id

   # After:
   from app.auth import get_current_user_id
   ```

3. **Search for any other files** importing from `auth_bridge`:
   ```bash
   grep -r "from app.auth_bridge" backend/app/ --include="*.py"
   grep -r "from app.cognito_auth" backend/app/ --include="*.py"
   ```
   Update every match.

### 3.7 Update User Sync Flow

The existing `backend/app/routes/users.py` already handles user creation on first login via the `/api/users/me` and `/api/users/sync` endpoints. These work with Clerk because:

- `get_current_user()` returns `{id, email, first_name, last_name, username, role}`
- The `User` model uses `String(255)` for `id`, compatible with Clerk's `user_xxxxxxxxxxxx` format
- The sync endpoint creates a user row if it doesn't exist

**One recommended change:** Update the docstrings from "Clerk" to remove the generic reference. The existing docstrings already say "Clerk" (they were written during the original Clerk era), so they are accurate.

### 3.8 Webhook Setup (Optional but Recommended)

Clerk webhooks notify your backend when users are created, updated, or deleted. This is useful for keeping the local database in sync even when changes happen through the Clerk Dashboard.

**3.8.1 Create a webhook endpoint**

Create a new file `backend/app/routes/webhooks.py`:

```python
"""Clerk webhook handler for user lifecycle events."""

import hashlib
import hmac
import logging
from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Header, Request
from sqlalchemy.orm import Session
from fastapi import Depends

from app.config import settings
from app.database import get_db
from app.models.database_models import User

logger = logging.getLogger(__name__)

router = APIRouter()


def verify_webhook_signature(
    payload: bytes,
    signature: str,
    secret: str,
) -> bool:
    """Verify the Clerk webhook signature using Svix."""
    # Clerk uses Svix for webhooks. For production, install svix:
    #   pip install svix
    # and use the Svix Webhook.verify() method.
    #
    # For a minimal implementation without svix, you can verify manually,
    # but using the svix library is strongly recommended.
    #
    # Example with svix:
    #   from svix.webhooks import Webhook
    #   wh = Webhook(secret)
    #   wh.verify(payload, headers)
    #
    # For now, this is a placeholder. Implement with svix in production.
    return True


@router.post("/clerk")
async def clerk_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Handle Clerk webhook events.

    Events handled:
    - user.created: Create user in local DB
    - user.updated: Update user in local DB
    - user.deleted: Optionally soft-delete user in local DB
    """
    body = await request.body()

    # In production, verify the webhook signature:
    # svix_id = request.headers.get("svix-id")
    # svix_timestamp = request.headers.get("svix-timestamp")
    # svix_signature = request.headers.get("svix-signature")
    # Verify using svix library (see verify_webhook_signature above)

    import json
    event = json.loads(body)

    event_type = event.get("type")
    data = event.get("data", {})

    logger.info(f"Received Clerk webhook: {event_type}")

    if event_type == "user.created":
        user_id = data.get("id")  # e.g., "user_xxxxxxxxxxxx"
        email = None
        email_addresses = data.get("email_addresses", [])
        if email_addresses:
            primary = next(
                (e for e in email_addresses if e["id"] == data.get("primary_email_address_id")),
                email_addresses[0],
            )
            email = primary.get("email_address")

        role = data.get("public_metadata", {}).get("role", "user")

        existing = db.query(User).filter(User.id == user_id).first()
        if not existing:
            db_user = User(
                id=user_id,
                email=email,
                first_name=data.get("first_name"),
                last_name=data.get("last_name"),
                username=data.get("username"),
                role=role,
                last_seen=datetime.utcnow(),
            )
            db.add(db_user)
            db.commit()
            logger.info(f"Created user {user_id} from webhook")

    elif event_type == "user.updated":
        user_id = data.get("id")
        db_user = db.query(User).filter(User.id == user_id).first()
        if db_user:
            email_addresses = data.get("email_addresses", [])
            if email_addresses:
                primary = next(
                    (e for e in email_addresses if e["id"] == data.get("primary_email_address_id")),
                    email_addresses[0],
                )
                db_user.email = primary.get("email_address")
            db_user.first_name = data.get("first_name", db_user.first_name)
            db_user.last_name = data.get("last_name", db_user.last_name)
            db_user.username = data.get("username", db_user.username)
            db_user.role = data.get("public_metadata", {}).get("role", db_user.role)
            db_user.updated_at = datetime.utcnow()
            db.commit()
            logger.info(f"Updated user {user_id} from webhook")

    elif event_type == "user.deleted":
        user_id = data.get("id")
        logger.info(f"User {user_id} deleted in Clerk (no local action taken)")
        # Decide: soft-delete, hard-delete, or ignore
        # For now, log only. The user's data remains in the DB.

    return {"status": "ok"}
```

**3.8.2 Register the webhook route**

In your `main.py` (or wherever routes are registered), add:

```python
from app.routes import webhooks
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["webhooks"])
```

**3.8.3 Configure in Clerk Dashboard**

1. Go to Clerk Dashboard > Webhooks
2. Add endpoint: `https://yourdomain.com/api/webhooks/clerk`
3. Select events: `user.created`, `user.updated`, `user.deleted`
4. Copy the signing secret to your `CLERK_WEBHOOK_SECRET` env var

**3.8.4 Install svix for webhook verification (production)**

```bash
pip install svix
```

Add to `requirements.txt`:
```
svix>=1.0.0  # For Clerk webhook signature verification
```

### 3.9 Remove Cognito Python Packages

The Cognito implementation uses `PyJWT` and `cryptography`, which are also needed for Clerk. The `boto3`/`botocore` packages can be removed IF no other code uses them (they may still be needed for S3/MinIO).

Check if boto3 is used elsewhere:
```bash
grep -r "import boto3\|from boto3" backend/app/ --include="*.py"
```

If boto3 is only used for Cognito (unlikely -- it is probably used for S3), then remove from `requirements.txt`:
```
boto3==1.34.10
botocore==1.34.10
```

---

## 4. Frontend Migration

### 4.1 Install Clerk React SDK

```bash
cd frontend
npm install @clerk/clerk-react
```

### 4.2 Remove AWS Amplify Packages

```bash
cd frontend
npm uninstall @aws-amplify/auth aws-amplify
```

### 4.3 Delete Cognito-Specific Files

Delete these files:
- `frontend/src/contexts/CognitoAuthContext.tsx`
- `frontend/src/components/auth/CognitoSignIn.tsx`
- `frontend/src/config/cognito.ts`

### 4.4 Update `main.tsx` -- Replace Auth Provider

**File:** `frontend/src/main.tsx`

Replace `CognitoAuthProvider` with Clerk's `ClerkProvider`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider } from "@clerk/clerk-react";
import "./index.css";
import App from "./App.tsx";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY environment variable");
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5000,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ClerkProvider>
  </StrictMode>
);
```

### 4.5 Update `useAuth.ts` Hook

**File:** `frontend/src/hooks/useAuth.ts`

Replace the Cognito re-export with a Clerk-based hook that maintains the same interface:

```ts
import { useUser, useAuth as useClerkAuth } from "@clerk/clerk-react";

/**
 * Auth hook that wraps Clerk's hooks to maintain the same interface
 * used throughout the app.
 */
export function useAuth() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut, getToken } = useClerkAuth();

  return {
    isLoaded,
    isSignedIn: isSignedIn ?? false,
    user: user
      ? {
          id: user.id,
          email: user.primaryEmailAddress?.emailAddress ?? "",
          username: user.username ?? undefined,
          firstName: user.firstName ?? undefined,
          lastName: user.lastName ?? undefined,
        }
      : null,
    signOut,
    getToken,
  };
}

/**
 * Helper function for getting auth token outside of React components.
 * Note: This cannot be used outside the ClerkProvider tree.
 * For non-component code, pass the token from a component.
 */
export async function getAuthToken(): Promise<string | null> {
  // This function is less useful with Clerk since getToken() comes from a hook.
  // Consider removing this and passing tokens explicitly where needed.
  return null;
}
```

### 4.6 Update `api.ts` -- Token Interceptor

**File:** `frontend/src/services/api.ts`

The tricky part: Axios interceptors run outside React's component tree, so you cannot call `useAuth()` inside them. The solution is to set the token on the Axios instance from within a React component.

**Option A: Token setter pattern (recommended)**

```ts
import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

/**
 * Set the auth token getter for the API client.
 * Call this from a React component that has access to Clerk's useAuth().
 */
let tokenGetter: (() => Promise<string | null>) | null = null;

export function setTokenGetter(getter: () => Promise<string | null>) {
  tokenGetter = getter;
}

// Request interceptor
api.interceptors.request.use(
  async (config) => {
    if (tokenGetter) {
      try {
        const token = await tokenGetter();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        console.log("No auth token available");
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor (keep existing error handling)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status, data } = error.response;
      const url = error.config?.url || "";

      if (status === 401) {
        console.error("Unauthorized access");
        // Optionally redirect to sign-in
      } else if (status === 404) {
        const isAnalysisEndpoint =
          url.includes("/analysis") ||
          url.includes("/transcript/words") ||
          url.includes("/meta-patterns") ||
          url.includes("/cross-insights") ||
          url.includes("/system-principles");
        if (isAnalysisEndpoint) {
          return Promise.reject({
            status: 404,
            message: "Analysis not found",
            data,
            silent: true,
          });
        }
        console.error("Resource not found");
      } else if (status === 500) {
        console.error("Server error");
      }

      return Promise.reject({
        status,
        message: data.detail || data.message || "An error occurred",
        data,
      });
    } else if (error.request) {
      return Promise.reject({
        status: 0,
        message: "No response from server. Please check your connection.",
      });
    } else {
      return Promise.reject({
        status: -1,
        message: error.message || "An unexpected error occurred",
      });
    }
  }
);

export default api;
```

**Then create a component to wire the token getter.**

Create `frontend/src/components/auth/ClerkTokenProvider.tsx`:

```tsx
import { useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { setTokenGetter } from "../../services/api";

/**
 * Invisible component that connects Clerk's auth token to the API client.
 * Must be rendered inside <ClerkProvider>.
 */
export function ClerkTokenProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    setTokenGetter(getToken);
  }, [getToken]);

  return <>{children}</>;
}
```

Wrap this around `<App />` in `main.tsx`:

```tsx
<ClerkProvider publishableKey={PUBLISHABLE_KEY}>
  <ClerkTokenProvider>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </ClerkTokenProvider>
</ClerkProvider>
```

### 4.7 Update `App.tsx` -- Routes and Auth Guards

**File:** `frontend/src/App.tsx`

Replace the manual auth guards with Clerk's components:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SignedIn, SignedOut, SignIn, useUser } from "@clerk/clerk-react";
import { UploadProvider } from "./contexts/UploadContext";
import { useUserSync } from "./hooks/useUserSync";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import VideoDetailPage from "./pages/VideoDetailPage";
import LandingPage from "./pages/LandingPage";

function AppContent() {
  // Sync user with backend when authenticated
  useUserSync();

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/"
        element={
          <>
            <SignedIn>
              <Navigate to="/projects" replace />
            </SignedIn>
            <SignedOut>
              <LandingPage />
            </SignedOut>
          </>
        }
      />

      <Route
        path="/sign-in/*"
        element={
          <>
            <SignedIn>
              <Navigate to="/projects" replace />
            </SignedIn>
            <SignedOut>
              <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <SignIn routing="path" path="/sign-in" />
              </div>
            </SignedOut>
          </>
        }
      />

      <Route
        path="/sign-up/*"
        element={
          <>
            <SignedIn>
              <Navigate to="/projects" replace />
            </SignedIn>
            <SignedOut>
              <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                {/* Clerk's SignUp component -- import from @clerk/clerk-react */}
                {/* <SignUp routing="path" path="/sign-up" /> */}
                {/* Or redirect to sign-in and let Clerk handle sign-up there */}
                <Navigate to="/sign-in" replace />
              </div>
            </SignedOut>
          </>
        }
      />

      {/* Protected routes */}
      <Route
        path="/projects"
        element={
          <>
            <SignedIn>
              <UploadProvider>
                <ProjectsPage />
              </UploadProvider>
            </SignedIn>
            <SignedOut>
              <Navigate to="/sign-in" replace />
            </SignedOut>
          </>
        }
      />

      <Route
        path="/projects/:projectId"
        element={
          <>
            <SignedIn>
              <UploadProvider>
                <ProjectDetailPage />
              </UploadProvider>
            </SignedIn>
            <SignedOut>
              <Navigate to="/sign-in" replace />
            </SignedOut>
          </>
        }
      />

      <Route
        path="/videos/:videoId"
        element={
          <>
            <SignedIn>
              <UploadProvider>
                <VideoDetailPage />
              </UploadProvider>
            </SignedIn>
            <SignedOut>
              <Navigate to="/sign-in" replace />
            </SignedOut>
          </>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
```

**Note:** The `<SignIn />` component from Clerk is a pre-built, drop-in UI. It handles email/password, social login, email verification, and password reset. You do not need to build any of this.

### 4.8 Update `Layout.tsx` -- User Menu

**File:** `frontend/src/components/Layout.tsx`

Replace the custom user avatar/dropdown with Clerk's `<UserButton />`:

```tsx
import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { FolderKanban } from "lucide-react";
import { SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";
import { UploadManager } from "./upload/UploadManager";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/projects" className="flex items-center gap-2">
            <FolderKanban className="h-6 w-6" />
            <span className="text-xl font-bold">Qualitative Research Tool</span>
          </Link>

          <div className="flex items-center gap-4">
            <SignedOut>
              <Link
                to="/sign-in"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Sign In
              </Link>
            </SignedOut>
            <SignedIn>
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: "w-10 h-10",
                  },
                }}
              />
            </SignedIn>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-6">{children}</main>

      {/* Global Upload Manager */}
      <UploadManager />
    </div>
  );
}
```

`<UserButton />` provides:
- User avatar (from their profile or initials)
- Dropdown with: profile management, sign out
- Session management
- No custom code needed

### 4.9 Update `useUserSync.ts`

**File:** `frontend/src/hooks/useUserSync.ts`

Update to use the new `useAuth` interface:

```ts
import { useEffect } from "react";
import { useAuth } from "./useAuth";
import { api } from "../services/api";

/**
 * Hook to sync user data with the backend after authentication.
 * Ensures the user exists in our database after signing in through Clerk.
 */
export function useUserSync() {
  const { isLoaded, isSignedIn, user } = useAuth();

  useEffect(() => {
    const syncUser = async () => {
      if (isLoaded && isSignedIn && user) {
        try {
          await api.post("/api/users/sync");
          console.log("User synced successfully");
        } catch (error) {
          console.error("Failed to sync user:", error);
        }
      }
    };

    syncUser();
  }, [isLoaded, isSignedIn, user]);
}
```

This file barely changes because the `useAuth` interface is the same.

### 4.10 Update `LandingPage.tsx`

The landing page has a "Sign In" link pointing to `/sign-in`. This still works with Clerk -- no changes needed unless you want to use Clerk's `<SignInButton />` component instead of a plain link.

---

## 5. Environment Variables

### 5.1 Backend Environment Variables

**Remove:**
```
COGNITO_USER_POOL_ID
COGNITO_APP_CLIENT_ID
COGNITO_REGION
USE_COGNITO_AUTH
```

**Add/Update:**
```
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxx       # From Clerk Dashboard > API Keys
CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxx  # From Clerk Dashboard > API Keys
CLERK_JWT_KEY=                               # Optional: PEM public key (JWKS is preferred)
CLERK_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx     # From Clerk Dashboard > Webhooks
```

### 5.2 Frontend Environment Variables

**Remove (from `.env`, `.env.development`, `.env.production`, etc.):**
```
VITE_COGNITO_REGION
VITE_COGNITO_USER_POOL_ID
VITE_COGNITO_APP_CLIENT_ID
```

**Add/Update:**
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxx
```

**Keep:**
```
VITE_API_URL=http://localhost:8000
```

### 5.3 Environment Files to Update

| File | Action |
|------|--------|
| `backend/.env` | Remove Cognito vars, add Clerk vars |
| `backend/.env.example` | Remove Cognito vars, add Clerk vars with placeholder values |
| `backend/.env.cognito` | **Delete entirely** |
| `backend/.env.production` | Remove Cognito vars, add production Clerk vars |
| `backend/.env.production.example` | Update with Clerk placeholders |
| `backend/.env.docker-local` | Remove Cognito vars, add Clerk vars |
| `frontend/.env` | Remove Cognito vars, add `VITE_CLERK_PUBLISHABLE_KEY` |
| `frontend/.env.example` | Update with Clerk placeholder |
| `frontend/.env.development` | Add `VITE_CLERK_PUBLISHABLE_KEY` |
| `frontend/.env.production` | Add production `VITE_CLERK_PUBLISHABLE_KEY` |
| `frontend/.env.production.local` | Add production `VITE_CLERK_PUBLISHABLE_KEY` |

### 5.4 Railway vs Cloudflare Pages

| Variable | Where to Set | Notes |
|----------|-------------|-------|
| `CLERK_SECRET_KEY` | Railway (backend service) | Secret, never expose to frontend |
| `CLERK_PUBLISHABLE_KEY` | Railway (backend service) | Backend needs it for JWKS URL derivation |
| `CLERK_WEBHOOK_SECRET` | Railway (backend service) | Secret, for webhook verification |
| `VITE_CLERK_PUBLISHABLE_KEY` | Cloudflare Pages (build env) | Public key, safe to expose |

---

## 6. User Management

### 6.1 Clerk Dashboard

Clerk provides a full user management dashboard at [dashboard.clerk.com](https://dashboard.clerk.com):

- **View all users**: See email, name, sign-in count, last active
- **Create users**: Invite by email or create directly
- **Disable/ban users**: Temporarily or permanently block access
- **Delete users**: Remove user entirely (triggers `user.deleted` webhook)
- **Edit metadata**: Set `publicMetadata.role` for RBAC

### 6.2 Role Assignment

**For the first admin user:**
1. User signs up normally through the app
2. Go to Clerk Dashboard > Users > select the user
3. Edit Public Metadata: `{ "role": "admin" }`
4. The JWT will include this role on next token refresh

**For subsequent admins:**
An existing admin could use a future admin panel, or you set it in the Clerk Dashboard.

**Default role for new users:**
New users get `"user"` role by default (the code falls back to `"user"` when no role is set in metadata). To automatically assign a role on signup, use a Clerk webhook on `user.created` that calls the Clerk API to set `publicMetadata.role = "user"` (or just rely on the backend's default).

### 6.3 Student Self-Registration

With Clerk's `<SignIn />` component, students can self-register:

1. Click "Sign up" on the sign-in page
2. Enter email and password
3. Clerk sends a verification email
4. Student clicks the verification link
5. Account is created with default `user` role
6. The `useUserSync` hook creates the database row on first login

To restrict registration (e.g., only allow certain email domains):
- Clerk Dashboard > User & Authentication > Restrictions
- Add allowlist domains (e.g., `@university.edu`)

### 6.4 Password Reset

Handled entirely by Clerk. The `<SignIn />` component includes a "Forgot password?" link that triggers Clerk's password reset flow (email with reset link). No backend code needed.

### 6.5 Email Verification

Handled entirely by Clerk. When a user signs up, Clerk sends a verification email. This is configurable in the Clerk Dashboard under **User & Authentication > Email, Phone, Username**.

---

## 7. Testing

### 7.1 Local Development Testing

1. Use the Clerk **Development** instance keys (prefixed with `pk_test_` / `sk_test_`)
2. Development instances work on `localhost` without custom domain setup
3. Set environment variables:
   ```
   # backend/.env
   CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxx
   CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxx

   # frontend/.env.development
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxx
   ```
4. Start backend and frontend
5. Navigate to `http://localhost:5173/sign-in`
6. Clerk's pre-built UI should appear
7. Sign up with a test email
8. Check the backend logs for JWT verification messages
9. Check the database for the new user row

### 7.2 Development vs Production Instances

| Aspect | Development | Production |
|--------|------------|------------|
| Key prefix | `pk_test_` / `sk_test_` | `pk_live_` / `sk_live_` |
| Domain | `*.clerk.accounts.dev` | Your custom domain |
| Email delivery | Clerk's test mode (limited) | Full email delivery |
| Rate limits | Lower | Higher |
| JWKS URL | Derived from publishable key | Derived from publishable key |
| Cost | Free tier | Depends on plan |

**Switching between instances:** Just change the environment variables. No code changes needed.

### 7.3 Common Pitfalls

**CORS Issues:**
- Clerk's frontend SDK makes requests to `*.clerk.accounts.dev` (development) or your Clerk domain (production)
- Your backend CORS settings (`ALLOWED_ORIGINS`) do NOT need to include the Clerk domain -- Clerk handles its own CORS
- Your backend CORS must include your frontend origin (e.g., `http://localhost:5173`)

**Domain Mismatch:**
- If the publishable key doesn't match the environment (e.g., using a production key on localhost), JWT verification will fail
- Always use `pk_test_` keys for local development

**Token Expiration:**
- Clerk session tokens expire after 60 seconds by default
- Clerk's frontend SDK automatically refreshes tokens before expiry
- If you see intermittent 401 errors, ensure the token getter is wired correctly (see section 4.6)

**JWKS Cache:**
- The `ClerkAuth` class caches public keys with `@lru_cache`
- If Clerk rotates keys, the cache must be cleared (the code already handles this with a retry)
- In rare cases, restart the backend if key rotation causes persistent failures

**Missing Custom Claims:**
- If the JWT does not contain `role`, `email`, etc., check the custom claims template in the Clerk Dashboard (section 2.5)
- The backend falls back to `"user"` role if no role is found, so the app will still work, but RBAC won't be effective for admins

---

## 8. Cleanup Checklist

### Files to Delete

```
backend/app/cognito_auth.py
backend/app/auth_bridge.py
backend/.env.cognito
frontend/src/contexts/CognitoAuthContext.tsx
frontend/src/components/auth/CognitoSignIn.tsx
frontend/src/config/cognito.ts
```

### Files to Create

```
frontend/src/components/auth/ClerkTokenProvider.tsx  (section 4.6)
backend/app/routes/webhooks.py                       (section 3.8, optional)
```

### Files to Modify

```
backend/app/config.py               (remove Cognito settings, section 3.3)
backend/app/auth.py                  (add has_role helper, section 3.4.2)
backend/app/routes/users.py          (update import, section 3.6)
backend/app/routes/projects.py       (update import, section 3.6)
backend/app/main.py                  (register webhook route, section 3.8.2)
backend/requirements.txt             (optionally add svix, clerk-backend-api)
frontend/package.json                (via npm install/uninstall)
frontend/src/main.tsx                (replace auth provider, section 4.4)
frontend/src/hooks/useAuth.ts        (rewrite for Clerk, section 4.5)
frontend/src/hooks/useUserSync.ts    (minor update, section 4.9)
frontend/src/services/api.ts         (new token pattern, section 4.6)
frontend/src/App.tsx                 (Clerk auth guards, section 4.7)
frontend/src/components/Layout.tsx   (UserButton, section 4.8)
backend/.env                         (update vars)
backend/.env.example                 (update vars)
backend/.env.production              (update vars)
backend/.env.production.example      (update vars)
backend/.env.docker-local            (update vars)
frontend/.env                        (update vars)
frontend/.env.example                (update vars)
frontend/.env.development            (add VITE_CLERK_PUBLISHABLE_KEY)
frontend/.env.production             (update vars)
frontend/.env.production.local       (update vars)
```

### Frontend Packages to Remove

```
@aws-amplify/auth
aws-amplify
```

### Frontend Packages to Add

```
@clerk/clerk-react
```

### Backend Packages to Add (Optional)

```
clerk-backend-api   (for user management API calls)
svix                (for webhook signature verification)
```

### Backend Packages to Potentially Remove

```
boto3               (only if not used for S3/MinIO -- check first)
botocore            (only if not used for S3/MinIO -- check first)
```

### Environment Variables to Remove

**Backend:**
```
COGNITO_USER_POOL_ID
COGNITO_APP_CLIENT_ID
COGNITO_REGION
USE_COGNITO_AUTH
```

**Frontend:**
```
VITE_COGNITO_REGION
VITE_COGNITO_USER_POOL_ID
VITE_COGNITO_APP_CLIENT_ID
```

### Environment Variables to Add

**Backend:**
```
CLERK_SECRET_KEY=
CLERK_PUBLISHABLE_KEY=
CLERK_WEBHOOK_SECRET=
```

**Frontend:**
```
VITE_CLERK_PUBLISHABLE_KEY=
```

---

## Implementation Order

Recommended sequence for the migration:

1. **Set up Clerk account** (section 2) -- 10 minutes
2. **Backend: update `config.py`** (section 3.3) -- 5 minutes
3. **Backend: update `auth.py`** (section 3.4) -- 5 minutes
4. **Backend: delete `cognito_auth.py` and `auth_bridge.py`** (section 3.5) -- 2 minutes
5. **Backend: update all imports** (section 3.6) -- 5 minutes
6. **Backend: test with curl/Postman** using a Clerk dev token -- 10 minutes
7. **Frontend: install Clerk, remove Amplify** (sections 4.1-4.3) -- 5 minutes
8. **Frontend: update `main.tsx`** (section 4.4) -- 5 minutes
9. **Frontend: update `useAuth.ts`** (section 4.5) -- 5 minutes
10. **Frontend: update `api.ts` + create `ClerkTokenProvider`** (section 4.6) -- 10 minutes
11. **Frontend: update `App.tsx`** (section 4.7) -- 10 minutes
12. **Frontend: update `Layout.tsx`** (section 4.8) -- 5 minutes
13. **Frontend: update env files** (section 5) -- 5 minutes
14. **End-to-end test** (section 7) -- 15 minutes
15. **Backend: add webhook endpoint** (section 3.8, optional) -- 15 minutes
16. **Cleanup: delete files, update env examples** (section 8) -- 10 minutes

**Estimated total: ~2 hours**
