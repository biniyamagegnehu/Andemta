'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  authClient,
  tokenManager,
  type AuthUser,
  type LoginResponseData,
} from '@/lib/api';

export interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  loginState: (data: LoginResponseData) => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // Prevent double-initialization in React 18/19 StrictMode during development
  const initStartedRef = useRef<boolean>(false);

  /**
   * Refreshes the session using the HttpOnly cookie and retrieves the current user profile.
   */
  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const refreshResult = await authClient.refreshSession();
      if (!refreshResult) {
        setUser(null);
        return false;
      }

      if (refreshResult.user) {
        setUser(refreshResult.user);
        return true;
      }

      // If refresh payload did not embed the user, fetch /auth/me
      const currentUser = await authClient.getCurrentUser();
      setUser(currentUser);
      return true;
    } catch {
      setUser(null);
      tokenManager.clearAccessToken();
      return false;
    }
  }, []);

  /**
   * Updates frontend authentication state immediately upon successful login.
   * Stores the access token in memory and updates the user record.
   */
  const loginState = useCallback((data: LoginResponseData) => {
    if (data.accessToken) {
      tokenManager.setAccessToken(data.accessToken);
    }
    if (data.user) {
      setUser(data.user);
    }
  }, []);

  /**
   * Terminates the session both on the backend and in local in-memory state.
   */
  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await authClient.logout();
    } finally {
      setUser(null);
      tokenManager.clearAccessToken();
      setIsLoading(false);
    }
  }, []);

  /**
   * Lifecycle initialization on application boot:
   * 1. Starts in loading / uninitialized state.
   * 2. Attempts session restoration using the HttpOnly refresh cookie.
   * 3. Sets user and authentication state if successful.
   * 4. Remains unauthenticated if no valid session exists.
   * 5. Always marks initialization complete without hanging.
   */
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      if (initStartedRef.current) return;
      initStartedRef.current = true;

      try {
        setIsLoading(true);
        const refreshResult = await authClient.refreshSession();

        if (refreshResult && isMounted) {
          if (refreshResult.user) {
            setUser(refreshResult.user);
          } else {
            const currentUser = await authClient.getCurrentUser();
            if (isMounted) setUser(currentUser);
          }
        }
      } catch {
        // No valid session or refresh cookie absent; user remains unauthenticated
        if (isMounted) {
          setUser(null);
          tokenManager.clearAccessToken();
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setIsInitialized(true);
        }
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    isInitialized,
    loginState,
    logout,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Custom hook to consume the AuthContext throughout client components.
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
