/**
 * Re-export auth hook from Cognito context
 * This maintains the same interface for existing components
 */

// Re-export from Cognito context
export { useAuth } from '../contexts/CognitoAuthContext';

// Helper function for getting auth token
export async function getAuthToken(): Promise<string | null> {
  try {
    const { fetchAuthSession } = await import('@aws-amplify/auth');
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() || null;
  } catch (error) {
    console.error("Failed to get auth token:", error);
    return null;
  }
}