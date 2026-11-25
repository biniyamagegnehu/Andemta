'use client';

import React from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { RoutePermissionGuard } from '@/components/auth/route-permission-guard';
import { PermissionGate } from '@/components/auth/permission-gate';
import { DashboardPageHeader } from '@/components/layout/dashboard-page-header';
import { EmptyState } from '@/components/layout/empty-state';

export default function ParticipantsPlaceholderPage() {
  return (
    <RoutePermissionGuard
      scope="organization"
      permissions={['participants.read']}
    >
      <div>
        <DashboardPageHeader
          title="Participants"
          description="Participant recruitment and eligibility workspace."
          actions={
            <PermissionGate
              scope="organization"
              permission="participants.recruit"
            >
              <span className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                Authorized to recruit participants
              </span>
            </PermissionGate>
          }
        />
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Participants module coming soon"
          description="Participant pool browsing and study recruitment workflows will be introduced in an upcoming phase."
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
