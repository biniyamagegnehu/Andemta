import React from 'react';
import Link from 'next/link';
import { PackageCheck } from 'lucide-react';
import { DashboardPageHeader } from '@/components/layout/dashboard-page-header';
import { EmptyState } from '@/components/layout/empty-state';

export default function ProductTestingPlaceholderPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Product Testing"
        description="Physical and digital product testing campaigns."
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
  );
}
