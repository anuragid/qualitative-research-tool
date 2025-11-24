import { useEffect } from "react";
import { useAuth } from "./useAuth";
import { api } from "../services/api";

/**
 * Hook to sync user data with the backend after authentication
 * This ensures the user exists in our database after signing in through Clerk
 */
export function useUserSync() {
  const { isLoaded, isSignedIn, user } = useAuth();

  useEffect(() => {
    const syncUser = async () => {
      if (isLoaded && isSignedIn && user) {
        try {
          // Call the sync endpoint to ensure user exists in database
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