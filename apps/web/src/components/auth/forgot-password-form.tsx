'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { authClient, ApiError } from '@/lib/api';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittedSuccess, setIsSubmittedSuccess] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  const validateEmail = (val: string): boolean => {
    const trimmed = val.trim();
    if (!trimmed) {
      setEmailError('Email address is required');
      return false;
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setEmailError('Please enter a valid email address');
      return false;
    }
    if (trimmed.length > 255) {
      setEmailError('Email address must be at most 255 characters long');
      return false;
    }
    setEmailError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (isSubmitting) return;

    if (!validateEmail(email)) {
      return;
    }

    setIsSubmitting(true);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      await authClient.forgotPassword(normalizedEmail);
      // Uniform generic success response protects against account enumeration
      setSubmittedEmail(normalizedEmail);
      setIsSubmittedSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setServerError(
            'Too many password reset attempts. Please wait a few minutes before trying again.',
          );
        } else if (err.isNetworkError) {
          setServerError(
            'Unable to connect to the server. Please verify your internet connection and try again.',
          );
        } else {
          setServerError(
            err.message || 'Unable to process your request. Please try again later.',
          );
        }
      } else {
        setServerError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmittedSuccess) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shadow-sm">
          <Mail className="h-7 w-7" aria-hidden="true" />
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Check your email
          </h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            If an account exists for{' '}
            <span className="font-semibold text-slate-900">{submittedEmail}</span>, we have
            sent instructions to reset your password.
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-left text-xs text-emerald-800 space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-emerald-900">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Instructions Dispatched</span>
          </div>
          <p>
            Please check your inbox and spam folder. The password reset link will expire in 30 minutes.
          </p>
        </div>

        <div className="pt-2 border-t border-slate-200">
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition"
          >
            <span>Return to Sign In</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {serverError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-xs text-rose-800 flex items-start gap-3"
        >
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <p className="font-medium flex-1">{serverError}</p>
        </div>
      )}

      <div>
        <label
          htmlFor="forgot-email"
          className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
        >
          Email address
        </label>
        <div className="relative mt-1.5 rounded-lg">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Mail className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <input
            id="forgot-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) validateEmail(e.target.value);
            }}
            onBlur={() => validateEmail(email)}
            disabled={isSubmitting}
            placeholder="researcher@andemta.et"
            className={`block w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 transition ${
              emailError ? 'border-rose-300 focus:ring-rose-500' : 'border-slate-300'
            }`}
            aria-invalid={!!emailError}
            aria-describedby={emailError ? 'forgot-email-error' : undefined}
          />
        </div>
        {emailError && (
          <p
            id="forgot-email-error"
            role="alert"
            className="mt-1.5 text-xs text-rose-600 font-medium"
          >
            {emailError}
          </p>
        )}
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Sending instructions...</span>
            </>
          ) : (
            <span>Send Reset Instructions</span>
          )}
        </button>
      </div>

      <div className="pt-2 text-center">
        <Link
          href="/login"
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          Back to Sign In
        </Link>
      </div>
    </form>
  );
}
