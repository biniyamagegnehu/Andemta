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
import { ApiError, authorizationClient } from '@/lib/api';
import { useAuth } from './use-auth';
import { useOrganizations } from './organization-context';

export type PermissionScope = 'system' | 'organization';

/**
 * Pure permission evaluation helpers (fail closed when unavailable or empty).
 */
export function hasPermissionInList(
  granted: readonly string[],
  required: string,
): boolean {
  if (!required || granted.length === 0) return false;
  return granted.includes(required);
}

export function hasAnyPermissionInList(
  granted: readonly string[],
  required: readonly string[],
): boolean {
  if (required.length === 0 || granted.length === 0) return false;
  return required.some((perm) => granted.includes(perm));
}

export function hasAllPermissionsInList(
  granted: readonly string[],
  required: readonly string[],
): boolean {
  if (required.length === 0 || granted.length === 0) return false;
  return required.every((perm) => granted.includes(perm));
}

export interface AuthorizationContextValue {
  systemRoles: string[];
  systemPermissions: string[];
  organizationPermissions: string[];
  organizationRole: string | null;
  organizationId: string | null;
  isSystemLoading: boolean;
  isOrganizationLoading: boolean;
  isLoading: boolean;
  error: string | null;
  hasSystemPermission: (permission: string) => boolean;
  hasAnySystemPermission: (permissions: readonly string[]) => boolean;
  hasAllSystemPermissions: (permissions: readonly string[]) => boolean;
  hasOrganizationPermission: (permission: string) => boolean;
  hasAnyOrganizationPermission: (permissions: readonly string[]) => boolean;
  hasAllOrganizationPermissions: (permissions: readonly string[]) => boolean;
  refreshAuthorization: () => Promise<void>;
}

export const AuthorizationContext = createContext<
  AuthorizationContextValue | undefined
>(undefined);

export function AuthorizationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isInitialized, user } = useAuth();
  const { selectedOrganizationId } = useOrganizations();

  const [systemRoles, setSystemRoles] = useState<string[]>([]);
  const [systemPermissions, setSystemPermissions] = useState<string[]>([]);
  const [isSystemLoading, setIsSystemLoading] = useState<boolean>(false);

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationRole, setOrganizationRole] = useState<string | null>(null);
  const [organizationPermissions, setOrganizationPermissions] = useState<
    string[]
  >([]);
  const [isOrganizationLoading, setIsOrganizationLoading] =
    useState<boolean>(false);

  const [error, setError] = useState<string | null>(null);

  // Monotonic sequence counters prevent stale or out-of-order responses
  const systemSeqRef = useRef<number>(0);
  const orgSeqRef = useRef<number>(0);

  const clearAllAuthorization = useCallback(() => {
    systemSeqRef.current += 1;
    orgSeqRef.current += 1;
    setSystemRoles([]);
    setSystemPermissions([]);
    setOrganizationId(null);
    setOrganizationRole(null);
    setOrganizationPermissions([]);
    setIsSystemLoading(false);
    setIsOrganizationLoading(false);
    setError(null);
  }, []);

  const fetchSystemAuthorization = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setSystemRoles([]);
      setSystemPermissions([]);
      setIsSystemLoading(false);
      return;
    }

    const seq = ++systemSeqRef.current;
    setIsSystemLoading(true);
    setError(null);

    try {
      const data = await authorizationClient.getSystemAuthorization();
      if (seq !== systemSeqRef.current) return;

      setSystemRoles(Array.isArray(data?.systemRoles) ? data.systemRoles : []);
      setSystemPermissions(
        Array.isArray(data?.permissions) ? data.permissions : [],
      );
    } catch (err: unknown) {
      if (seq !== systemSeqRef.current) return;
      setSystemRoles([]);
      setSystemPermissions([]);
      const message =
        err instanceof ApiError
          ? err.message
          : 'Unable to load system authorization.';
      setError(message);
    } finally {
      if (seq === systemSeqRef.current) {
        setIsSystemLoading(false);
      }
    }
  }, [isAuthenticated, user?.id]);

  const fetchOrganizationAuthorization = useCallback(
    async (targetOrgId: string | null) => {
      // Immediately clear previous organization permissions to prevent stale leakage
      const seq = ++orgSeqRef.current;
      setOrganizationId(null);
      setOrganizationRole(null);
      setOrganizationPermissions([]);

      if (!isAuthenticated || !user?.id || !targetOrgId) {
        setIsOrganizationLoading(false);
        return;
      }

      setIsOrganizationLoading(true);
      setError(null);

      try {
        const data =
          await authorizationClient.getOrganizationAuthorization(targetOrgId);
        if (seq !== orgSeqRef.current) return;

        setOrganizationId(data.organizationId);
        setOrganizationRole(data.roleCode);
        setOrganizationPermissions(
          Array.isArray(data?.permissions) ? data.permissions : [],
        );
      } catch (err: unknown) {
        if (seq !== orgSeqRef.current) return;
        setOrganizationId(null);
        setOrganizationRole(null);
        setOrganizationPermissions([]);
        const message =
          err instanceof ApiError
            ? err.message
            : 'Unable to load organization authorization.';
        setError(message);
      } finally {
        if (seq === orgSeqRef.current) {
          setIsOrganizationLoading(false);
        }
      }
    },
    [isAuthenticated, user?.id],
  );

  // Load system authorization on authentication state change
  useEffect(() => {
    if (!isInitialized) return;
    if (!isAuthenticated) {
      clearAllAuthorization();
      return;
    }
    void fetchSystemAuthorization();
  }, [
    isInitialized,
    isAuthenticated,
    fetchSystemAuthorization,
    clearAllAuthorization,
  ]);

  // Reload organization authorization whenever selectedOrganizationId changes
  useEffect(() => {
    if (!isInitialized) return;
    if (!isAuthenticated) {
      return;
    }
    void fetchOrganizationAuthorization(selectedOrganizationId);
  }, [
    isInitialized,
    isAuthenticated,
    selectedOrganizationId,
    fetchOrganizationAuthorization,
  ]);

  const refreshAuthorization = useCallback(async () => {
    await Promise.all([
      fetchSystemAuthorization(),
      fetchOrganizationAuthorization(selectedOrganizationId),
    ]);
  }, [
    fetchSystemAuthorization,
    fetchOrganizationAuthorization,
    selectedOrganizationId,
  ]);

  const canEvaluateSystem =
    isAuthenticated && !isSystemLoading && error === null;
  const canEvaluateOrg =
    isAuthenticated &&
    !isOrganizationLoading &&
    error === null &&
    organizationId !== null &&
    organizationId === selectedOrganizationId;

  const hasSystemPermission = useCallback(
    (permission: string) =>
      canEvaluateSystem && hasPermissionInList(systemPermissions, permission),
    [canEvaluateSystem, systemPermissions],
  );

  const hasAnySystemPermission = useCallback(
    (permissions: readonly string[]) =>
      canEvaluateSystem &&
      hasAnyPermissionInList(systemPermissions, permissions),
    [canEvaluateSystem, systemPermissions],
  );

  const hasAllSystemPermissions = useCallback(
    (permissions: readonly string[]) =>
      canEvaluateSystem &&
      hasAllPermissionsInList(systemPermissions, permissions),
    [canEvaluateSystem, systemPermissions],
  );

  const hasOrganizationPermission = useCallback(
    (permission: string) =>
      canEvaluateOrg &&
      hasPermissionInList(organizationPermissions, permission),
    [canEvaluateOrg, organizationPermissions],
  );

  const hasAnyOrganizationPermission = useCallback(
    (permissions: readonly string[]) =>
      canEvaluateOrg &&
      hasAnyPermissionInList(organizationPermissions, permissions),
    [canEvaluateOrg, organizationPermissions],
  );

  const hasAllOrganizationPermissions = useCallback(
    (permissions: readonly string[]) =>
      canEvaluateOrg &&
      hasAllPermissionsInList(organizationPermissions, permissions),
    [canEvaluateOrg, organizationPermissions],
  );

  const value: AuthorizationContextValue = {
    systemRoles,
    systemPermissions,
    organizationPermissions,
    organizationRole,
    organizationId,
    isSystemLoading,
    isOrganizationLoading,
    isLoading: isSystemLoading || isOrganizationLoading,
    error,
    hasSystemPermission,
    hasAnySystemPermission,
    hasAllSystemPermissions,
    hasOrganizationPermission,
    hasAnyOrganizationPermission,
    hasAllOrganizationPermissions,
    refreshAuthorization,
  };

  return (
    <AuthorizationContext.Provider value={value}>
      {children}
    </AuthorizationContext.Provider>
  );
}

export function useAuthorization(): AuthorizationContextValue {
  const ctx = useContext(AuthorizationContext);
  if (!ctx) {
    throw new Error(
      'useAuthorization must be used within an AuthorizationProvider',
    );
  }
  return ctx;
}
