'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Building2, Loader2 } from 'lucide-react';
import { ApiError, organizationsClient, type OrganizationType } from '@/lib/api';
import { useOrganizations } from '@/context/organization-context';
import {
  ORGANIZATION_TYPE_OPTIONS,
  validateCreateOrganizationForm,
  type CreateOrganizationFormErrors,
  type CreateOrganizationFormValues,
} from './organization-validation';

export function OrganizationCreateForm() {
  const router = useRouter();
  const { reloadOrganizations } = useOrganizations();

  const [values, setValues] = useState<CreateOrganizationFormValues>({
    name: '',
    slug: '',
    type: 'BUSINESS',
  });
  const [fieldErrors, setFieldErrors] = useState<CreateOrganizationFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setServerError(null);

    const validation = validateCreateOrganizationForm(values);
    if (!validation.valid) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const created = await organizationsClient.createOrganization(
        validation.payload,
      );
      await reloadOrganizations(created.id);
      router.push(`/organizations/${created.id}`);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.errors && err.errors.length > 0) {
          const nextErrors: CreateOrganizationFormErrors = {};
          for (const detail of err.errors) {
            if (detail.field === 'name') nextErrors.name = detail.message;
            if (detail.field === 'slug') nextErrors.slug = detail.message;
            if (detail.field === 'type') nextErrors.type = detail.message;
          }
          setFieldErrors(nextErrors);
        }
        setServerError(err.message);
      } else {
        setServerError(
          'Unable to register organization right now. Please try again.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      aria-labelledby="register-organization-heading"
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs"
    >
      <div className="mb-6 flex items-start gap-3 border-b border-slate-100 pb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h2
            id="register-organization-heading"
            className="text-base font-semibold text-slate-900"
          >
            Organization Details
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Register a new organization. You will be assigned as its initial
            owner.
          </p>
        </div>
      </div>

      {serverError ? (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div>
          <label
            htmlFor="org-name"
            className="block text-sm font-medium text-slate-700"
          >
            Organization Name <span className="text-red-500">*</span>
          </label>
          <input
            id="org-name"
            name="name"
            type="text"
            required
            maxLength={120}
            value={values.name}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="e.g. Addis Consumer Insights"
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? 'org-name-error' : undefined}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
          />
          {fieldErrors.name ? (
            <p id="org-name-error" className="mt-1.5 text-xs text-red-600">
              {fieldErrors.name}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">
              Must be between 2 and 120 characters.
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="org-slug"
            className="block text-sm font-medium text-slate-700"
          >
            Organization Slug <span className="text-slate-400">(Optional)</span>
          </label>
          <input
            id="org-slug"
            name="slug"
            type="text"
            maxLength={80}
            value={values.slug}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, slug: e.target.value }))
            }
            placeholder="e.g. addis-consumer-insights"
            aria-invalid={Boolean(fieldErrors.slug)}
            aria-describedby={fieldErrors.slug ? 'org-slug-error' : undefined}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
          />
          {fieldErrors.slug ? (
            <p id="org-slug-error" className="mt-1.5 text-xs text-red-600">
              {fieldErrors.slug}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">
              Lowercase letters, numbers, and single hyphens. Leave blank to
              generate automatically.
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="org-type"
            className="block text-sm font-medium text-slate-700"
          >
            Organization Type
          </label>
          <select
            id="org-type"
            name="type"
            value={values.type}
            onChange={(e) =>
              setValues((prev) => ({
                ...prev,
                type: e.target.value as OrganizationType,
              }))
            }
            aria-invalid={Boolean(fieldErrors.type)}
            aria-describedby={fieldErrors.type ? 'org-type-error' : undefined}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
          >
            {ORGANIZATION_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {fieldErrors.type ? (
            <p id="org-type-error" className="mt-1.5 text-xs text-red-600">
              {fieldErrors.type}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <Link
            href="/organizations"
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Registering...
              </>
            ) : (
              'Register Organization'
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
