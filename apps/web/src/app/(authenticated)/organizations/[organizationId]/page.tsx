'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Loader2,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { ApiError, organizationsClient, type UserOrganization } from '@/lib/api';
import { useOrganizations } from '@/context/organization-context';
import { useAuthorization } from '@/context/authorization-context';
import { PermissionGate } from '@/components/auth/permission-gate';
import { DashboardPageHeader } from '@/components/layout/dashboard-page-header';
import { UnauthorizedState } from '@/components/layout/unauthorized-state';
import { OrganizationUpdateForm } from '@/components/organizations/organization-update-form';
import { formatOrganizationTypeLabel } from '@/components/organizations/organization-validation';

export default function OrganizationDetailsPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params?.organizationId;

  const {
    organizations,
    selectedOrganizationId,
    selectOrganization,
    reloadOrganizations,
  } = useOrganizations();
  const authorization = useAuthorization();

  const [organization, setOrganization] = useState<UserOrganization | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadOrganization = useCallback(async () => {
    if (!organizationId) {
      setIsLoading(false);
      setErrorStatus(404);
      setErrorMessage('Organization not found.');
      return;
    }

    setIsLoading(true);
    setErrorStatus(null);
    setErrorMessage(null);

    try {
      const data = await organizationsClient.getOrganization(organizationId);
      setOrganization(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorStatus(err.status);
        setErrorMessage(err.message);
      } else {
        setErrorStatus(null);
        setErrorMessage('Unable to load organization details.');
      }
      setOrganization(null);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void loadOrganization();
  }, [loadOrganization]);

  useEffect(() => {
    if (
      organization &&
      selectedOrganizationId !== organization.id &&
      organizations.some((org) => org.id === organization.id)
    ) {
      selectOrganization(organization.id);
    }
  }, [
    organization,
    organizations,
    selectedOrganizationId,
    selectOrganization,
  ]);

  const handleOrganizationUpdated = async (updated: UserOrganization) => {
    setOrganization(updated);
    await reloadOrganizations(updated.id);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-xs">
          <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
          Loading organization details...
        </div>
      </div>
    );
  }

  if (errorStatus === 403) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <UnauthorizedState
          title="Organization access denied"
          description={
            errorMessage ||
            'You do not have permission to view this organization.'
          }
        />
        <div>
          <Link
            href="/organizations"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Organizations
          </Link>
        </div>
      </div>
    );
  }

  if (errorStatus === 404 || !organization) {
    const isNotFound = errorStatus === 404;
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                {isNotFound
                  ? 'Organization not found'
                  : 'Failed to load organization'}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                {errorMessage ||
                  'The requested organization could not be found or loaded.'}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href="/organizations"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Organizations
                </Link>
                {!isNotFound ? (
                  <button
                    type="button"
                    onClick={() => void loadOrganization()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isContextAligned = authorization.organizationId === organization.id;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <DashboardPageHeader
        title={organization.name}
        description={`Organization workspace • /${organization.slug}`}
        actions={
          <Link
            href="/organizations"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All Organizations
          </Link>
        }
      />

      <section
        aria-labelledby="organization-overview-heading"
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs"
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="organization-overview-heading"
                className="text-base font-semibold text-slate-900"
              >
                Organization Overview
              </h2>
              <p className="text-xs text-slate-500">
                Identifier: <span className="font-mono">{organization.id}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {organization.roleCode ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                Role: {organization.roleCode}
              </span>
            ) : null}
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              {organization.status}
            </span>
          </div>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Name
            </dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">
              {organization.name}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Slug
            </dt>
            <dd className="mt-1 font-mono text-sm text-slate-700">
              {organization.slug}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Type
            </dt>
            <dd className="mt-1 text-sm text-slate-700">
              {formatOrganizationTypeLabel(organization.type)}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Created
            </dt>
            <dd className="mt-1 text-sm text-slate-700">
              {new Date(organization.createdAt).toLocaleDateString()}
            </dd>
          </div>
        </dl>
      </section>

      {!isContextAligned || authorization.isOrganizationLoading ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-xs">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
            Checking organization permissions...
          </div>
        </section>
      ) : (
        <PermissionGate
          scope="organization"
          permission="organization.update"
          fallback={
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              <div className="flex items-start gap-2.5">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                <div>
                  <p className="font-medium text-slate-800">Read-only access</p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    You do not have permission to update this organization&apos;s
                    details.
                  </p>
                </div>
              </div>
            </section>
          }
        >
          <OrganizationUpdateForm
            organization={organization}
            onOrganizationUpdated={handleOrganizationUpdated}
          />
        </PermissionGate>
      )}
    </div>
  );
}
