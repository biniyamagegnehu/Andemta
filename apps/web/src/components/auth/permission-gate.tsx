'use client';

import React, { type ReactNode } from 'react';
import {
  useAuthorization,
  type PermissionScope,
} from '@/context/authorization-context';

export interface PermissionGateProps {
  scope: PermissionScope;
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Renders children only when the user holds `permission` in the explicit `scope`.
 * Fails closed while authorization is loading or errored.
 */
export function PermissionGate({
  scope,
  permission,
  children,
  fallback = null,
}: PermissionGateProps) {
  const { hasSystemPermission, hasOrganizationPermission } = useAuthorization();

  const allowed =
    scope === 'system'
      ? hasSystemPermission(permission)
      : hasOrganizationPermission(permission);

  return allowed ? <>{children}</> : <>{fallback}</>;
}

export interface MultiPermissionGateProps {
  scope: PermissionScope;
  permissions: readonly string[];
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Renders children if the user holds at least one of `permissions` in `scope`.
 */
export function AnyPermissionGate({
  scope,
  permissions,
  children,
  fallback = null,
}: MultiPermissionGateProps) {
  const { hasAnySystemPermission, hasAnyOrganizationPermission } =
    useAuthorization();

  const allowed =
    scope === 'system'
      ? hasAnySystemPermission(permissions)
      : hasAnyOrganizationPermission(permissions);

  return allowed ? <>{children}</> : <>{fallback}</>;
}

/**
 * Renders children only if the user holds all of `permissions` in `scope`.
 */
export function AllPermissionsGate({
  scope,
  permissions,
  children,
  fallback = null,
}: MultiPermissionGateProps) {
  const { hasAllSystemPermissions, hasAllOrganizationPermissions } =
    useAuthorization();

  const allowed =
    scope === 'system'
      ? hasAllSystemPermissions(permissions)
      : hasAllOrganizationPermissions(permissions);

  return allowed ? <>{children}</> : <>{fallback}</>;
}
