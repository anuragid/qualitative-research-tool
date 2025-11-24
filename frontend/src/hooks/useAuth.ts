import { useUser, useAuth as useClerkAuth } from "@clerk/clerk-react";

/**
 * Custom hook to access authentication state and user information
 */
export function useAuth() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useClerkAuth();

  return {
    isLoaded,
    isSignedIn,
    user,
    userId: user?.id,
    userEmail: user?.primaryEmailAddress?.emailAddress,
    getToken,
  };
}

/**
 * Get the authentication token for API requests
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const token = await window.Clerk?.session?.getToken();
    return token || null;
  } catch (error) {
    console.error("Failed to get auth token:", error);
    return null;
  }
}