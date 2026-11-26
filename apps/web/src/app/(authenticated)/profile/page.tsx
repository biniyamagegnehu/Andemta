'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { ApiError, usersClient, type UserProfile } from '@/lib/api';
import { useAuth } from '@/context/use-auth';
import { DashboardPageHeader } from '@/components/layout/dashboard-page-header';
import { ProfileOverviewCard } from '@/components/profile/profile-overview-card';
import { ProfileEditForm } from '@/components/profile/profile-edit-form';

export default function ProfilePage() {
  const { isAuthenticated, isInitialized } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await usersClient.getMyProfile();
      setProfile(data);
    } catch (err: unknown) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Unable to load your profile. Please try again.';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isInitialized || !isAuthenticated) return;
    void loadProfile();
  }, [isInitialized, isAuthenticated, loadProfile]);

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        title="Profile"
        description="Manage your personal information and language preferences."
      />

      {isLoading ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600"
        >
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          <span>Loading your profile…</span>
        </div>
      ) : loadError ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadProfile()}
            className="inline-flex items-center justify-center rounded-lg bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800"
          >
            Try again
          </button>
        </div>
      ) : profile ? (
        <div className="space-y-6">
          <ProfileOverviewCard profile={profile} />
          <ProfileEditForm
            profile={profile}
            onProfileUpdated={(updated) => setProfile(updated)}
          />
        </div>
      ) : null}
    </div>
  );
}
