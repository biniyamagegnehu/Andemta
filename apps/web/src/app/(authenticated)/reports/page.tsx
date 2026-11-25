'use client';

import React from 'react';
import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';
import { PermissionGate } from '@/components/auth/permission-gate';
import { DashboardPageHeader } from '@/components/layout/dashboard-page-header';
import { EmptyState } from '@/components/layout/empty-state';

export default function ReportsPlaceholderPage() {
  return (
    <RoutePermissionGuard scope="organization" permissions={['reports.read']}>
      <div>
        <DashboardPageHeader
          title="Reports"
          description="Aggregated research insights and dataset exports."
          actions={
            <PermissionGate scope="organization" permission="reports.export">
              <span className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                Authorized to export reports
              </span>
            </PermissionGate>
          }
        />
        <EmptyState
          icon={<BarChart3 className="h-6 w-6" />}
          title="Reports module coming soon"
          description="Research reporting and export capabilities will be introduced in an upcoming phase."
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
