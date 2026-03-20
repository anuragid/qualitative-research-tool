import { useEffect, useRef } from "react";
import { useAuth } from "./useAuth";
import { api } from "../services/api";

/**
 * Hook to sync user data with the backend after authentication.
 * This ensures the user exists in our database after signing in through Clerk.
 * Only syncs once per user ID to avoid redundant API calls.
 */
export function useUserSync() {
  const { isLoaded, isSignedIn, user } = useAuth();
  const syncedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const syncUser = async () => {
      if (isLoaded && isSignedIn && user && user.id !== syncedUserIdRef.current) {
        try {
          await api.post("/api/users/sync");
          syncedUserIdRef.current = user.id;
        } catch (error) {
          console.warn("User sync failed, will retry:", error);
        }
      }
    };

    syncUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user?.id is sufficient; `user` object changes on every render
  }, [isLoaded, isSignedIn, user?.id]);
}