import React from 'react';
import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { DashboardPageHeader } from '@/components/layout/dashboard-page-header';
import { EmptyState } from '@/components/layout/empty-state';

export default function ReportsPlaceholderPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Reports"
        description="Aggregated research insights and dataset exports."
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
  );
}
