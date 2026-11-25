'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ApiError,
  organizationsClient,
  type UserOrganization,
} from '@/lib/api';
import { useAuth } from './use-auth';

/**
 * Pure helper to validate that a candidate organization ID exists in the user's
 * returned organization list. Falls back to the first organization or null.
 */
export function resolveValidOrganizationId(
  organizations: UserOrganization[],
  candidateId: string | null,
): string | null {
  if (organizations.length === 0) {
    return null;
  }
  if (candidateId && organizations.some((org) => org.id === candidateId)) {
    return candidateId;
  }
  return organizations[0].id;
}

export interface OrganizationContextValue {
  organizations: UserOrganization[];
  selectedOrganization: UserOrganization | null;
  selectedOrganizationId: string | null;
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  selectOrganization: (organizationId: string) => void;
  reloadOrganizations: () => Promise<void>;
}

export const OrganizationContext = createContext<
  OrganizationContextValue | undefined
>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isInitialized } = useAuth();
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<
    string | null
  >(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasLoaded, setHasLoaded] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrganizations = useCallback(async () => {
    if (!isAuthenticated) {
      setOrganizations([]);
      setSelectedOrganizationId(null);
      setHasLoaded(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await organizationsClient.listMyOrganizations({
        page: 1,
        limit: 50,
      });
      const items = Array.isArray(response?.items) ? response.items : [];
      setOrganizations(items);
      setSelectedOrganizationId((prev) =>
        resolveValidOrganizationId(items, prev),
      );
    } catch (err: unknown) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Unable to load your organizations.';
      setError(message);
      setOrganizations([]);
      setSelectedOrganizationId(null);
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!isAuthenticated) {
      setOrganizations([]);
      setSelectedOrganizationId(null);
      setHasLoaded(false);
      setError(null);
      return;
    }
    loadOrganizations();
  }, [isInitialized, isAuthenticated, loadOrganizations]);

  const selectOrganization = useCallback(
    (organizationId: string) => {
      // Never allow selecting an organization not present in the user's fetched list
      const isAllowed = organizations.some((org) => org.id === organizationId);
      if (!isAllowed) {
        return;
      }
      setSelectedOrganizationId(organizationId);
    },
    [organizations],
  );

  const selectedOrganization = useMemo(
    () =>
      organizations.find((org) => org.id === selectedOrganizationId) ?? null,
    [organizations, selectedOrganizationId],
  );

  const value: OrganizationContextValue = {
    organizations,
    selectedOrganization,
    selectedOrganizationId,
    isLoading,
    hasLoaded,
    error,
    selectOrganization,
    reloadOrganizations: loadOrganizations,
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganizations(): OrganizationContextValue {
  const ctx = useContext(OrganizationContext);
  if (!ctx) {
    throw new Error(
      'useOrganizations must be used within an OrganizationProvider',
    );
  }
  return ctx;
}
