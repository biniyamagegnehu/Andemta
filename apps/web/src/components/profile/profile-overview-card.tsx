'use client';

import React from 'react';
import {
  Calendar,
  CheckCircle2,
  Globe,
  Mail,
  Phone,
  ShieldAlert,
} from 'lucide-react';
import type { UserProfile } from '@/lib/api';
import { getUserInitials } from '@/components/layout/user-account-menu';
import { getProfileLanguageLabel } from './profile-validation';

export interface ProfileOverviewCardProps {
  profile: UserProfile;
}

export function ProfileOverviewCard({ profile }: ProfileOverviewCardProps) {
  const initials = getUserInitials(profile.fullName || profile.email);
  const formattedCreatedAt = new Date(profile.createdAt).toLocaleDateString(
    undefined,
    {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    },
  );

  return (
    <section
      aria-labelledby="profile-overview-heading"
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        {/* Initials-only avatar placeholder (no upload in Phase 5.1) */}
        <div
          aria-hidden="true"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xl font-bold text-white shadow-xs"
        >
          {initials}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3
              id="profile-overview-heading"
              className="truncate text-xl font-bold text-slate-900"
            >
              {profile.fullName || 'Name not set'}
            </h3>

            {profile.emailVerifiedAt ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                Unverified
              </span>
            )}
          </div>

          <div className="mt-3 grid gap-2.5 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-2 min-w-0">
              <Mail
                className="h-4 w-4 shrink-0 text-slate-400"
                aria-hidden="true"
              />
              <span className="truncate">{profile.email}</span>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <Phone
                className="h-4 w-4 shrink-0 text-slate-400"
                aria-hidden="true"
              />
              <span className="truncate">
                {profile.phoneNumber || 'Phone not provided'}
              </span>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <Globe
                className="h-4 w-4 shrink-0 text-slate-400"
                aria-hidden="true"
              />
              <span className="truncate">
                {getProfileLanguageLabel(profile.preferredLanguage)}
              </span>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <Calendar
                className="h-4 w-4 shrink-0 text-slate-400"
                aria-hidden="true"
              />
              <span className="truncate">Joined {formattedCreatedAt}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
