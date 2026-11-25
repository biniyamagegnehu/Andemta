import React from 'react';
import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { DashboardPageHeader } from '@/components/layout/dashboard-page-header';
import { EmptyState } from '@/components/layout/empty-state';

export default function SurveysPlaceholderPage() {
  return (
    <div>
      <DashboardPageHeader
        title="Surveys"
        description="Survey authoring and participant response workspace."
      />
      <EmptyState
        icon={<ClipboardList className="h-6 w-6" />}
        title="Surveys module coming soon"
        description="Survey creation, publishing, and response workflows will be introduced in an upcoming phase."
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
