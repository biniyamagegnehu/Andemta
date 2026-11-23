'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { getSafeRedirectUrl } from '@/lib/api';

export function GoogleCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get('error');
  const returnUrl = searchParams.get('returnUrl');

  const { refreshSession } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  // Prevent double-execution from React 18/19 StrictMode during development
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    // If backend redirected with an error code, bounce to /login with the error parameter
    if (oauthError) {
      router.replace(`/login?error=${encodeURIComponent(oauthError)}`);
      return;
    }

    if (hasProcessedRef.current) return;
    hasProcessedRef.current = true;

    async function completeOAuthSession() {
      setIsProcessing(true);
      setErrorMessage(null);

      try {
        // Backend has already set the HttpOnly cookie 'andemta_refresh'
        // We restore the session and access token via the Phase 3.10 refresh flow
        const success = await refreshSession();

        if (success) {
          const safeDestination = getSafeRedirectUrl(returnUrl);
          router.replace(safeDestination);
        } else {
          setErrorMessage(
            'Unable to restore session after Google authentication. Please try logging in again.',
          );
          setIsProcessing(false);
        }
      } catch {
        setErrorMessage(
          'An unexpected error occurred during Google sign-in. Please try again.',
        );
        setIsProcessing(false);
      }
    }

    completeOAuthSession();
  }, [oauthError, refreshSession, returnUrl, router]);

  if (isProcessing) {
    return (
      <div className="space-y-6 text-center py-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Completing sign-in...
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Please wait while we establish your secure session with Google.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-center py-4">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
        <AlertCircle className="h-8 w-8" />
      </div>

      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">
          Authentication Incomplete
        </h2>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          {errorMessage}
        </p>
      </div>

      <div className="pt-2">
        <Link
          href="/login"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 transition"
        >
          <span>Return to Sign In</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
