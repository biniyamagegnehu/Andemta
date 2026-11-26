'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DashboardPageHeader } from '@/components/layout/dashboard-page-header';
import { OrganizationCreateForm } from '@/components/organizations/organization-create-form';

export default function NewOrganizationPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <DashboardPageHeader
        title="Register Organization"
        description="Create a new organization workspace on Andemta."
        actions={
          <Link
            href="/organizations"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Organizations
          </Link>
        }
      />

      <OrganizationCreateForm />
    </div>
  );
}
