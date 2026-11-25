'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/use-auth';
import { useOrganizations } from '@/context/organization-context';
import { AUTHENTICATED_NAV_ITEMS } from '@/config/navigation';
import { DashboardPageHeader } from '@/components/layout/dashboard-page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { NavIcon } from '@/components/layout/nav-icon';

export default function DashboardPage() {
  const { user } = useAuth();
  const {
    organizations,
    selectedOrganization,
    isLoading,
    error,
    reloadOrganizations,
  } = useOrganizations();

  const sectionLinks = AUTHENTICATED_NAV_ITEMS.filter(
    (item) => item.href !== '/dashboard',
  );

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title={`Welcome, ${user?.email ?? 'Researcher'}`}
        description="Andemta Consumer Research Marketplace workspace"
      />

      {/* Organization Summary */}
      <section aria-labelledby="org-summary-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <h3
            id="org-summary-heading"
            className="text-base font-semibold text-slate-900"
          >
            Organization Summary
          </h3>
          <Link
            href="/organizations"
            className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            View all organizations
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            <span>Loading your organization memberships…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void reloadOrganizations()}
              className="inline-flex items-center justify-center rounded-lg bg-rose-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-800"
            >
              Try again
            </button>
          </div>
        ) : organizations.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-6 w-6" />}
            title="You have not joined any organization yet"
            description="Once you create or are added to an organization, it will appear here and in the header organization selector."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Active Organizations
              </div>
              <div className="mt-2 text-3xl font-bold text-slate-900">
                {organizations.length}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Organizations where you currently hold an active membership.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Currently Selected
              </div>
              {selectedOrganization ? (
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-lg font-semibold text-slate-900">
                      {selectedOrganization.name}
                    </span>
                    <CheckCircle2
                      className="h-4 w-4 shrink-0 text-emerald-600"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">
                      {selectedOrganization.type}
                    </span>
                    <span className="rounded bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                      Role: {selectedOrganization.roleCode}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600">
                  No organization selected.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Navigation Sections */}
      <section aria-labelledby="workspace-sections-heading" className="space-y-4">
        <h3
          id="workspace-sections-heading"
          className="text-base font-semibold text-slate-900"
        >
          Workspace Sections
        </h3>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sectionLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-emerald-300 hover:shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <NavIcon icon={item.icon} className="h-5 w-5" />
                  </div>
                  {item.isPlaceholder && (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                      Coming soon
                    </span>
                  )}
                </div>
                <h4 className="mt-4 text-base font-semibold text-slate-900 group-hover:text-emerald-700">
                  {item.label}
                </h4>
                <p className="mt-1 text-sm text-slate-600">{item.description}</p>
              </div>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <span>Open {item.label}</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
