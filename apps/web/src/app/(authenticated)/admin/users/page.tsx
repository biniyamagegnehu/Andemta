'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';
import { PermissionGate } from '@/components/auth/permission-gate';
import { DashboardPageHeader } from '@/components/layout/dashboard-page-header';
import { EmptyState } from '@/components/layout/empty-state';

export default function AdminUsersPlaceholderPage() {
  return (
    <RoutePermissionGuard scope="system" permissions={['users.read']}>
      <div>
        <DashboardPageHeader
          title="Admin Users"
          description="Platform-wide user and system role administration."
          actions={
            <PermissionGate scope="system" permission="users.manage">
              <span className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                Authorized to manage system roles
              </span>
            </PermissionGate>
          }
        />
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6" />}
          title="Platform Admin Console coming soon"
          description="Frontend user and system-role management UI will be introduced in an upcoming phase. Backend /api/v1/admin/users endpoints are active."
          action={
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Back to Dashboard
            </Link>
          }
        />
      </div>
    </RoutePermissionGuard>
  );
}
