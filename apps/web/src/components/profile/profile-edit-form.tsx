'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Lock } from 'lucide-react';
import { ApiError, usersClient, type UserProfile } from '@/lib/api';
import {
  PROFILE_LANGUAGE_OPTIONS,
  buildChangedProfilePayload,
  toProfileFormValues,
  validateProfileForm,
  type ProfileFormErrors,
  type ProfileFormValues,
} from './profile-validation';

export interface ProfileEditFormProps {
  profile: UserProfile;
  onProfileUpdated: (updated: UserProfile) => void;
}

export function ProfileEditForm({
  profile,
  onProfileUpdated,
}: ProfileEditFormProps) {
  const [values, setValues] = useState<ProfileFormValues>(() =>
    toProfileFormValues(profile),
  );
  const [fieldErrors, setFieldErrors] = useState<ProfileFormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setValues(toProfileFormValues(profile));
  }, [profile]);

  const changedPayload = useMemo(
    () => buildChangedProfilePayload(profile, values),
    [profile, values],
  );
  const hasChanges = changedPayload !== null;

  const handleReset = () => {
    setValues(toProfileFormValues(profile));
    setFieldErrors({});
    setServerError(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setServerError(null);
    setSuccessMessage(null);

    const validation = validateProfileForm(values);
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
      const updated = await usersClient.updateMyProfile(changedPayload);
      onProfileUpdated(updated);
      setSuccessMessage('Your profile has been updated.');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.errors && err.errors.length > 0) {
          const nextErrors: ProfileFormErrors = {};
          for (const detail of err.errors) {
            if (detail.field === 'fullName') nextErrors.fullName = detail.message;
            if (detail.field === 'phoneNumber')
              nextErrors.phoneNumber = detail.message;
            if (detail.field === 'preferredLanguage')
              nextErrors.preferredLanguage = detail.message;
            if (detail.field === 'bio') nextErrors.bio = detail.message;
          }
          setFieldErrors(nextErrors);
        }
        setServerError(err.message);
      } else {
        setServerError('Unable to save profile changes. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="personal-info-heading"
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs"
    >
      <div className="mb-5 border-b border-slate-100 pb-4">
        <h3
          id="personal-info-heading"
          className="text-base font-semibold text-slate-900"
        >
          Personal Information
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Update your display name, contact phone number, preferred language,
          and biography.
        </p>
      </div>

      {successMessage && (
        <div
          role="status"
          className="mb-5 flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {serverError && (
        <div
          role="alert"
          className="mb-5 flex items-center gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-5">
        {/* Read-only Email Address */}
        <div>
          <label
            htmlFor="profile-email"
            className="block text-sm font-medium text-slate-700"
          >
            Email address
          </label>
          <div className="relative mt-1.5">
            <input
              id="profile-email"
              type="email"
              value={profile.email}
              readOnly
              disabled
              className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 pr-10 text-sm text-slate-500 cursor-not-allowed"
            />
            <Lock
              className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Email address changes are not currently available.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {/* Full Name */}
          <div>
            <label
              htmlFor="profile-full-name"
              className="block text-sm font-medium text-slate-700"
            >
              Full name
            </label>
            <input
              id="profile-full-name"
              name="fullName"
              type="text"
              value={values.fullName}
              onChange={(e) => {
                setValues((prev) => ({ ...prev, fullName: e.target.value }));
                setSuccessMessage(null);
                if (fieldErrors.fullName) {
                  setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
                }
              }}
              disabled={isSaving}
              maxLength={120}
              placeholder="e.g. Biniyam Tesfaye"
              aria-invalid={!!fieldErrors.fullName}
              aria-describedby={
                fieldErrors.fullName ? 'profile-full-name-error' : undefined
              }
              className={`mt-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 ${
                fieldErrors.fullName
                  ? 'border-rose-300 focus:ring-rose-500'
                  : 'border-slate-300'
              }`}
            />
            {fieldErrors.fullName && (
              <p
                id="profile-full-name-error"
                role="alert"
                className="mt-1.5 text-xs font-medium text-rose-600"
              >
                {fieldErrors.fullName}
              </p>
            )}
          </div>

          {/* Phone Number */}
          <div>
            <label
              htmlFor="profile-phone-number"
              className="block text-sm font-medium text-slate-700"
            >
              Phone number
            </label>
            <input
              id="profile-phone-number"
              name="phoneNumber"
              type="tel"
              value={values.phoneNumber}
              onChange={(e) => {
                setValues((prev) => ({ ...prev, phoneNumber: e.target.value }));
                setSuccessMessage(null);
                if (fieldErrors.phoneNumber) {
                  setFieldErrors((prev) => ({
                    ...prev,
                    phoneNumber: undefined,
                  }));
                }
              }}
              disabled={isSaving}
              placeholder="+251911223344"
              aria-invalid={!!fieldErrors.phoneNumber}
              aria-describedby={
                fieldErrors.phoneNumber ? 'profile-phone-error' : undefined
              }
              className={`mt-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 ${
                fieldErrors.phoneNumber
                  ? 'border-rose-300 focus:ring-rose-500'
                  : 'border-slate-300'
              }`}
            />
            {fieldErrors.phoneNumber && (
              <p
                id="profile-phone-error"
                role="alert"
                className="mt-1.5 text-xs font-medium text-rose-600"
              >
                {fieldErrors.phoneNumber}
              </p>
            )}
          </div>
        </div>

        {/* Preferred Language */}
        <div className="sm:max-w-xs">
          <label
            htmlFor="profile-preferred-language"
            className="block text-sm font-medium text-slate-700"
          >
            Preferred language
          </label>
          <select
            id="profile-preferred-language"
            name="preferredLanguage"
            value={values.preferredLanguage}
            onChange={(e) => {
              setValues((prev) => ({
                ...prev,
                preferredLanguage: e.target.value as ProfileFormValues['preferredLanguage'],
              }));
              setSuccessMessage(null);
            }}
            disabled={isSaving}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100"
          >
            {PROFILE_LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Bio */}
        <div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="profile-bio"
              className="block text-sm font-medium text-slate-700"
            >
              Bio
            </label>
            <span className="text-xs text-slate-500">
              {values.bio.trim().length}/500
            </span>
          </div>
          <textarea
            id="profile-bio"
            name="bio"
            rows={4}
            value={values.bio}
            onChange={(e) => {
              setValues((prev) => ({ ...prev, bio: e.target.value }));
              setSuccessMessage(null);
              if (fieldErrors.bio) {
                setFieldErrors((prev) => ({ ...prev, bio: undefined }));
              }
            }}
            disabled={isSaving}
            maxLength={500}
            placeholder="Tell organizations or colleagues a little about your background."
            aria-invalid={!!fieldErrors.bio}
            aria-describedby={fieldErrors.bio ? 'profile-bio-error' : undefined}
            className={`mt-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 ${
              fieldErrors.bio
                ? 'border-rose-300 focus:ring-rose-500'
                : 'border-slate-300'
            }`}
          />
          {fieldErrors.bio && (
            <p
              id="profile-bio-error"
              role="alert"
              className="mt-1.5 text-xs font-medium text-rose-600"
            >
              {fieldErrors.bio}
            </p>
          )}
        </div>

        {/* Form Actions */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={handleReset}
            disabled={isSaving || !hasChanges}
            className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isSaving || !hasChanges}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            <span>{isSaving ? 'Saving…' : 'Save Changes'}</span>
          </button>
        </div>
      </form>
    </section>
  );
}
