import type { ReactNode } from "react";

// Stub ClerkProvider — renders children without Clerk initialization
export function ClerkProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// Stub UserButton — renders a simple avatar placeholder
export function UserButton() {
  return (
    <div
      data-testid="clerk-user-button"
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: "#e5e7eb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        color: "#6b7280",
      }}
    >
      U
    </div>
  );
}

// Stub SignIn / SignUp
export function SignIn() {
  return <div data-testid="clerk-sign-in">Sign In (mock)</div>;
}

export function SignUp() {
  return <div data-testid="clerk-sign-up">Sign Up (mock)</div>;
}

// Stub hooks
export function useAuth() {
  return {
    isLoaded: true,
    isSignedIn: true,
    signOut: () => Promise.resolve(),
    getToken: () => Promise.resolve("mock-token"),
    userId: "user_mock_storybook",
    sessionId: "sess_mock_storybook",
  };
}

export function useUser() {
  return {
    isLoaded: true,
    isSignedIn: true,
    user: {
      id: "user_mock_storybook",
      primaryEmailAddress: { emailAddress: "storybook@example.com" },
      username: "storybook-user",
      firstName: "Storybook",
      lastName: "User",
      imageUrl: "",
    },
  };
}

export function useClerk() {
  return {
    loaded: true,
    signOut: () => Promise.resolve(),
    openSignIn: () => {},
    openSignUp: () => {},
  };
}

export function useSignIn() {
  return { isLoaded: true, signIn: null, setActive: () => {} };
}

export function useSignUp() {
  return { isLoaded: true, signUp: null, setActive: () => {} };
}

export function useSession() {
  return {
    isLoaded: true,
    isSignedIn: true,
    session: { id: "sess_mock_storybook" },
  };
}
