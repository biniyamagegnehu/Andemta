import React from 'react';
import Link from 'next/link';
import { FlaskConical } from 'lucide-react';
import { DashboardPageHeader } from '@/components/layout/dashboard-page-header';
import { EmptyState } from '@/components/layout/empty-state';

export default function ResearchPlaceholderPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Research"
        description="Consumer research project workspace."
      />
      <EmptyState
        icon={<FlaskConical className="h-6 w-6" />}
        title="Research module coming soon"
        description="Research project creation and management will be introduced in an upcoming phase."
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
