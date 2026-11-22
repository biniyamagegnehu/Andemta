'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  RefreshCw,
  Mail,
} from 'lucide-react';
import { authClient, ApiError } from '@/lib/api';
import { ResendVerificationForm } from './resend-verification-form';

type VerificationState =
  | 'verifying'
  | 'missing_token'
  | 'success'
  | 'error'
  | 'network_error';

export function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<VerificationState>('verifying');
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Prevent double-submission in React 18/19 StrictMode during development
  const hasSubmittedRef = useRef(false);

  const verifyToken = async (rawToken: string) => {
    setState('verifying');
    setErrorMessage(null);

    try {
      const response = await authClient.verifyEmail(rawToken);
      setVerifiedEmail(response.email);
      setState('success');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.isNetworkError) {
          setErrorMessage(
            'Unable to connect to the verification server. Please verify your internet connection and try again.',
          );
          setState('network_error');
        } else {
          setErrorMessage(
            err.message ||
              'Invalid or expired verification token. Please request a new verification link.',
          );
          setState('error');
        }
      } else {
        setErrorMessage(
          'An unexpected error occurred during verification. Please try again.',
        );
        setState('error');
      }
    }
  };

  useEffect(() => {
    if (!token || !token.trim()) {
      setState('missing_token');
      return;
    }

    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;

    verifyToken(token.trim());
  }, [token]);

  // 1. VERIFYING STATE
  if (state === 'verifying') {
    return (
      <div className="space-y-6 text-center py-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Verifying your email...
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Please wait while we confirm your email address.
          </p>
        </div>
      </div>
    );
  }

  // 2. SUCCESS STATE
  if (state === 'success') {
    return (
      <div className="space-y-6 text-center py-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shadow-sm">
          <CheckCircle2 className="h-8 w-8" />
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Email verified successfully!
          </h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            {verifiedEmail ? (
              <>
                Your email <span className="font-semibold text-slate-900">{verifiedEmail}</span> has been confirmed.
              </>
            ) : (
              'Your email address has been confirmed.'
            )}{' '}
            Your account is now ready to use.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 transition"
          >
            <span>Sign In to Your Account</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  // 3. MISSING TOKEN STATE
  if (state === 'missing_token') {
    return (
      <div className="space-y-6 text-center py-2">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
          <Mail className="h-7 w-7" />
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Verification Link Incomplete
          </h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            No verification token was found in this link. Please check your email and open the full link provided, or request a replacement below.
          </p>
        </div>

        <div className="pt-4 border-t border-slate-200 text-left">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-3">
            Request a new verification link
          </h3>
          <ResendVerificationForm compact />
        </div>

        <div className="pt-2 border-t border-slate-200">
          <Link
            href="/login"
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  // 4. NETWORK ERROR STATE
  if (state === 'network_error') {
    return (
      <div className="space-y-6 text-center py-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
          <AlertCircle className="h-8 w-8" />
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Connection Error
          </h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            {errorMessage}
          </p>
        </div>

        {token && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => verifyToken(token.trim())}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Retry Verification</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // 5. GENERIC ERROR STATE (Expired / Invalid / Already Used)
  return (
    <div className="space-y-6 text-center py-2">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
        <AlertCircle className="h-8 w-8" />
      </div>

      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">
          Verification Failed
        </h2>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          {errorMessage}
        </p>
      </div>

      <div className="pt-4 border-t border-slate-200 text-left">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-3">
          Need a new verification link?
        </h3>
        <ResendVerificationForm compact />
      </div>

      <div className="pt-2 border-t border-slate-200">
        <Link
          href="/login"
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          Already verified? Sign In
        </Link>
      </div>
    </div>
  );
}
