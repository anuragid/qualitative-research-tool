/**
 * Auth hook wrapping Clerk's useAuth and useUser.
 * Maintains the same interface used throughout the app.
 */
import { useAuth as useClerkAuth, useUser } from "@clerk/react";

export function useAuth() {
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
