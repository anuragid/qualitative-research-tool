/**
 * AWS Cognito Authentication Context
 * Provides authentication functionality throughout the app
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Amplify } from 'aws-amplify';
import { signIn, signOut, signUp, confirmSignUp, getCurrentUser, fetchAuthSession, type SignInOutput } from '@aws-amplify/auth';
import { cognitoConfig } from '../config/cognito';

// Configure Amplify
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: cognitoConfig.userPoolId,
      userPoolClientId: cognitoConfig.userPoolWebClientId,
    },
  },
});

interface User {
  id: string;
  email: string;
  username?: string;
}

interface AuthContextType {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: User | null;
  signIn: (email: string, password: string) => Promise<SignInOutput>;
  signUp: (email: string, password: string) => Promise<any>;
  confirmSignUp: (email: string, code: string) => Promise<any>;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function CognitoAuthProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Check if user is already signed in
  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();

      if (currentUser && session.tokens) {
        setUser({
          id: currentUser.userId,
          email: currentUser.signInDetails?.loginId || '',
          username: currentUser.username,
        });
        setIsSignedIn(true);
      }
    } catch (error) {
      // User is not signed in
      console.log('User not signed in');
    } finally {
      setIsLoaded(true);
    }
  };

  const handleSignIn = async (email: string, password: string): Promise<SignInOutput> => {
    try {
      const result = await signIn({
        username: email,
        password
      });

      if (result.isSignedIn) {
        await checkUser(); // Refresh user data
      }

      return result;
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const handleSignUp = async (email: string, password: string) => {
    try {
      const result = await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
          },
        },
      });
      return result;
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  };

  const handleConfirmSignUp = async (email: string, code: string) => {
    try {
      const result = await confirmSignUp({
        username: email,
        confirmationCode: code,
      });
      return result;
    } catch (error) {
      console.error('Confirm sign up error:', error);
      throw error;
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setUser(null);
      setIsSignedIn(false);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  const getToken = async (): Promise<string | null> => {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString() || null;
    } catch (error) {
      console.error('Failed to get token:', error);
      return null;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isLoaded,
        isSignedIn,
        user,
        signIn: handleSignIn,
        signUp: handleSignUp,
        confirmSignUp: handleConfirmSignUp,
        signOut: handleSignOut,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within a CognitoAuthProvider');
  }
  return context;
}