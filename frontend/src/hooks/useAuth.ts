/**
 * Auth hook wrapping Clerk's useAuth and useUser.
 * In dev mode (VITE_DEV_AUTH_BYPASS=true), returns a mock dev user
 * matching the backend's dev_user_local identity — no Clerk required.
 */
import { useAuth as useClerkAuth, useUser } from "@clerk/react";

const DEV_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === "true";

const DEV_USER = {
  id: "dev_user_local",
  email: "dev@localhost",
  username: "dev",
};

// Dev auth — no Clerk hooks, always "signed in" as dev_user_local
function useDevAuth() {
  return {
    isLoaded: true,
    isSignedIn: true,
    user: DEV_USER,
    signOut: async () => {},
    getToken: async () => "dev-bypass" as string | null,
  };
}

// Production auth — wraps Clerk hooks
function useClerkAuthWrapper() {
  const { isLoaded, isSignedIn, signOut, getToken } = useClerkAuth();
  const { user } = useUser();

  return {
    isLoaded,
    isSignedIn: isSignedIn ?? false,
    user: user
      ? {
          id: user.id,
          email: user.primaryEmailAddress?.emailAddress || "",
          username: user.username || undefined,
        }
      : null,
    signOut,
    getToken,
  };
}

// Export one or the other — DEV_BYPASS is a compile-time constant,
// so the unused branch is tree-shaken and hook call order is stable.
export const useAuth = DEV_BYPASS ? useDevAuth : useClerkAuthWrapper;
