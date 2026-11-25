'use client';

import React from 'react';
import Link from 'next/link';
import { PackageCheck } from 'lucide-react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';
import { PermissionGate } from '@/components/auth/permission-gate';
import { DashboardPageHeader } from '@/components/layout/dashboard-page-header';
import { EmptyState } from '@/components/layout/empty-state';

export default function ProductTestingPlaceholderPage() {
  return (
    <RoutePermissionGuard
      scope="organization"
      permissions={['product_testing.read']}
    >
      <div>
        <DashboardPageHeader
          title="Product Testing"
          description="Physical and digital product testing campaigns."
          actions={
            <PermissionGate
              scope="organization"
              permission="product_testing.create"
            >
              <span className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                Authorized to create campaigns
              </span>
            </PermissionGate>
          }
        />
        <EmptyState
          icon={<PackageCheck className="h-6 w-6" />}
          title="Product Testing module coming soon"
          description="Product testing campaign management and participation workflows will be introduced in an upcoming phase."
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
