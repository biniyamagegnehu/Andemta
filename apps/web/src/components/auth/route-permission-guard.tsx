'use client';

import React, { type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/use-auth';
import { useOrganizations } from '@/context/organization-context';
import {
  useAuthorization,
  type PermissionScope,
} from '@/context/authorization-context';
import { UnauthorizedState } from '../layout/unauthorized-state';

export interface RoutePermissionGuardProps {
  scope: PermissionScope;
  permissions: readonly string[];
  mode?: 'all' | 'any';
  children: ReactNode;
}

/**
 * Protects authenticated routes based on effective backend permissions.
 * - Waits for auth and authorization initialization before deciding access.
 * - Never relies on sidebar visibility alone.
 * - Renders a clear 403-style UnauthorizedState when permission or org context is missing.
 */
export function RoutePermissionGuard({
  scope,
  permissions,
  mode = 'all',
  children,
}: RoutePermissionGuardProps) {
  const { isInitialized, isAuthenticated } = useAuth();
  const {
    isLoading: isOrgListLoading,
    hasLoaded: hasOrgListLoaded,
    selectedOrganizationId,
  } = useOrganizations();
  const {
    isSystemLoading,
    isOrganizationLoading,
    organizationId,
    error,
    hasAnySystemPermission,
    hasAllSystemPermissions,
    hasAnyOrganizationPermission,
    hasAllOrganizationPermissions,
  } = useAuthorization();

  const isWaiting =
    !isInitialized ||
    !isAuthenticated ||
    (scope === 'system' && isSystemLoading) ||
    (scope === 'organization' &&
      (!hasOrgListLoaded ||
        isOrgListLoading ||
        isOrganizationLoading ||
        (selectedOrganizationId !== null &&
          organizationId !== selectedOrganizationId &&
          error === null)));

  if (isWaiting) {
    return (
      <div
        className="flex min-h-[240px] items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
        <span>Verifying permissions…</span>
      </div>
    );
  }

  if (scope === 'organization' && !selectedOrganizationId) {
    return (
      <UnauthorizedState
        title="Organization Context Required"
        description="Select an active organization with the required permissions to access this section."
      />
    );
  }

  const allowed =
    scope === 'system'
      ? mode === 'any'
        ? hasAnySystemPermission(permissions)
        : hasAllSystemPermissions(permissions)
      : mode === 'any'
        ? hasAnyOrganizationPermission(permissions)
        : hasAllOrganizationPermissions(permissions);

  if (!allowed) {
    return <UnauthorizedState />;
  }

  return <>{children}</>;
}
