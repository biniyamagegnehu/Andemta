'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import {
  ApiError,
  organizationsClient,
  type OrganizationType,
  type UserOrganization,
} from '@/lib/api';
import {
  ORGANIZATION_TYPE_OPTIONS,
  buildChangedOrganizationPayload,
  validateUpdateOrganizationForm,
  type UpdateOrganizationFormErrors,
  type UpdateOrganizationFormValues,
} from './organization-validation';

export interface OrganizationUpdateFormProps {
  organization: UserOrganization;
  onOrganizationUpdated: (updated: UserOrganization) => void | Promise<void>;
}

export function OrganizationUpdateForm({
  organization,
  onOrganizationUpdated,
}: OrganizationUpdateFormProps) {
  const [values, setValues] = useState<UpdateOrganizationFormValues>({
    name: organization.name,
    type: organization.type,
  });
  const [fieldErrors, setFieldErrors] = useState<UpdateOrganizationFormErrors>(
    {},
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setValues({
      name: organization.name,
      type: organization.type,
    });
  }, [organization]);

  const changedPayload = useMemo(
    () => buildChangedOrganizationPayload(organization, values),
    [organization, values],
  );
  const hasChanges = changedPayload !== null;

  const handleReset = () => {
    setValues({
      name: organization.name,
      type: organization.type,
    });
    setFieldErrors({});
    setServerError(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setServerError(null);
    setSuccessMessage(null);

    const validation = validateUpdateOrganizationForm(values);
    if (!validation.valid) {
      setFieldErrors(validation.errors);
      return;
    }

    if (!changedPayload) {
      return;
    }

    setFieldErrors({});
    setIsSaving(true);

    try {
      const updated = await organizationsClient.updateOrganization(
        organization.id,
        changedPayload,
      );
      await onOrganizationUpdated(updated);
      setSuccessMessage('Organization details have been updated.');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.errors && err.errors.length > 0) {
          const nextErrors: UpdateOrganizationFormErrors = {};
          for (const detail of err.errors) {
            if (detail.field === 'name') nextErrors.name = detail.message;
            if (detail.field === 'type') nextErrors.type = detail.message;
          }
          setFieldErrors(nextErrors);
        }
        setServerError(err.message);
      } else {
        setServerError(
          'Unable to update organization details. Please try again.',
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="update-organization-heading"
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs"
    >
      <div className="mb-5 border-b border-slate-100 pb-4">
        <h2
          id="update-organization-heading"
          className="text-base font-semibold text-slate-900"
        >
          Update Organization
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Edit your organization&apos;s display name or classification.
        </p>
      </div>

      {serverError ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      ) : null}

      {successMessage ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label
            htmlFor="edit-org-name"
            className="block text-sm font-medium text-slate-700"
          >
            Organization Name
          </label>
          <input
            id="edit-org-name"
            name="name"
            type="text"
            required
            maxLength={120}
            value={values.name}
            onChange={(e) => {
              setSuccessMessage(null);
              setValues((prev) => ({ ...prev, name: e.target.value }));
            }}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={
              fieldErrors.name ? 'edit-org-name-error' : undefined
            }
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
          />
          {fieldErrors.name ? (
            <p id="edit-org-name-error" className="mt-1.5 text-xs text-red-600">
              {fieldErrors.name}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="edit-org-type"
            className="block text-sm font-medium text-slate-700"
          >
            Organization Type
          </label>
          <select
            id="edit-org-type"
            name="type"
            value={values.type}
            onChange={(e) => {
              setSuccessMessage(null);
              setValues((prev) => ({
                ...prev,
                type: e.target.value as OrganizationType,
              }));
            }}
            aria-invalid={Boolean(fieldErrors.type)}
            aria-describedby={
              fieldErrors.type ? 'edit-org-type-error' : undefined
            }
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
          >
            {ORGANIZATION_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {fieldErrors.type ? (
            <p id="edit-org-type-error" className="mt-1.5 text-xs text-red-600">
              {fieldErrors.type}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={handleReset}
            disabled={!hasChanges || isSaving}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={!hasChanges || isSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
