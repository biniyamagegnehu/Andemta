'use client';

import React from 'react';
import Link from 'next/link';
import { AlertCircle, Building2, Loader2, Plus, RefreshCw } from 'lucide-react';
import { useOrganizations } from '@/context/organization-context';
import { useAuthorization } from '@/context/authorization-context';
import { PermissionGate } from '@/components/auth/permission-gate';
import { DashboardPageHeader } from '@/components/layout/dashboard-page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { formatOrganizationTypeLabel } from '@/components/organizations/organization-validation';

export default function OrganizationsPage() {
  const {
    organizations,
    selectedOrganizationId,
    isLoading,
    hasLoaded,
    error,
    selectOrganization,
    reloadOrganizations,
  } = useOrganizations();
  const { organizationRole, isOrganizationLoading } = useAuthorization();

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Organizations"
        description="Organizations you belong to on Andemta."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PermissionGate scope="organization" permission="organization.read">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                Active Role:{' '}
                {isOrganizationLoading ? '...' : organizationRole ?? 'None'}
              </span>
            </PermissionGate>
            <PermissionGate
              scope="organization"
              permission="organization.update"
            >
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                Can Update Active Org
              </span>
            </PermissionGate>
            <Link
              href="/organizations/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              Register Organization
            </Link>
          </div>
        }
      />

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void reloadOrganizations()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : null}

      {isLoading && !hasLoaded ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-xs">
          <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
          Loading your organizations...
        </div>
      ) : organizations.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-6 w-6" />}
          title="No organizations yet"
          description="You are not a member of any organization yet. Register an organization to get started."
          action={
            <Link
              href="/organizations/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              Register Organization
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {organizations.map((org) => {
            const isSelected = org.id === selectedOrganizationId;
            return (
              <div
                key={org.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        {org.name}
                      </h2>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">
                        {org.slug}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        {formatOrganizationTypeLabel(org.type)}
                      </span>
                      {org.roleCode ? (
                        <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-medium text-white">
                          {org.roleCode}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <Link
                    href={`/organizations/${org.id}`}
                    className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    View Details
                  </Link>
                  <button
                    type="button"
                    onClick={() => selectOrganization(org.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {isSelected ? 'Selected' : 'Select organization'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
