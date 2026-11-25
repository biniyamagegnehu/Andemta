'use client';

import React from 'react';
import { Building2, Check, Loader2 } from 'lucide-react';
import { useOrganizations } from '@/context/organization-context';
import { DashboardPageHeader } from '@/components/layout/dashboard-page-header';
import { EmptyState } from '@/components/layout/empty-state';

export default function OrganizationsPage() {
  const {
    organizations,
    selectedOrganizationId,
    selectOrganization,
    isLoading,
    error,
    reloadOrganizations,
  } = useOrganizations();

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Organizations"
        description="Active organizations associated with your Andemta account."
      />

      {isLoading ? (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          <span>Loading organizations…</span>
        </div>
      ) : error ? (
        <div className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void reloadOrganizations()}
            className="inline-flex items-center justify-center rounded-lg bg-rose-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-800"
          >
            Retry
          </button>
        </div>
      ) : organizations.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-6 w-6" />}
          title="No organizations found"
          description="You do not currently belong to any active organization."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {organizations.map((org) => {
            const isSelected = org.id === selectedOrganizationId;
            return (
              <div
                key={org.id}
                className={`flex flex-col justify-between rounded-xl border bg-white p-5 shadow-xs transition ${
                  isSelected
                    ? 'border-emerald-500 ring-1 ring-emerald-500'
                    : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-slate-900">
                      {org.name}
                    </h3>
                    {isSelected && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <Check className="h-3 w-3" aria-hidden="true" />
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Slug: {org.slug}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                      {org.type}
                    </span>
                    <span className="rounded bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                      Role: {org.roleCode}
                    </span>
                  </div>
                </div>

                {!isSelected && (
                  <button
                    type="button"
                    onClick={() => selectOrganization(org.id)}
                    className="mt-4 inline-flex min-h-[38px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Select organization
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
