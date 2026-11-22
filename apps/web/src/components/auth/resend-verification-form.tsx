'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mail, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { authClient, ApiError } from '@/lib/api';

export interface ResendVerificationFormProps {
  defaultEmail?: string;
  onSuccess?: () => void;
  compact?: boolean;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOLDOWN_SECONDS = 60;

export function ResendVerificationForm({
  defaultEmail = '',
  compact = false,
}: ResendVerificationFormProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (defaultEmail) {
      setEmail(defaultEmail);
    }
  }, [defaultEmail]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const startCooldown = useCallback((seconds: number) => {
    setCooldownRemaining(seconds);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    timerRef.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

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
      setEmailError('Email must be at most 255 characters long');
      return false;
    }
    setEmailError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    if (cooldownRemaining > 0) return;
    if (!validateEmail(email)) return;

    setIsLoading(true);
    try {
      const response = await authClient.resendVerification(email.trim().toLowerCase());
      setStatusMessage(
        response.message ||
          'If an account requires email verification, a verification email will be sent.',
      );
      startCooldown(COOLDOWN_SECONDS);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setErrorMessage(
            'Too many requests. Please wait a few minutes before requesting another verification email.',
          );
          startCooldown(COOLDOWN_SECONDS);
        } else if (err.isNetworkError) {
          setErrorMessage(
            'Unable to connect to the server. Please verify your internet connection and try again.',
          );
        } else {
          setErrorMessage(
            err.message ||
              'Unable to send verification email. Please try again later.',
          );
        }
      } else {
        setErrorMessage('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={compact ? 'w-full' : 'w-full max-w-md'}>
      {statusMessage && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-xs text-emerald-800 flex items-start gap-2.5"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs text-rose-800 flex items-start gap-2.5"
        >
          <AlertCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label
            htmlFor="resend-email"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
          >
            Email address
          </label>
          <div className="relative mt-1.5 rounded-lg">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Mail className="h-4 w-4 text-slate-400" aria-hidden="true" />
            </div>
            <input
              id="resend-email"
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
              disabled={isLoading || cooldownRemaining > 0}
              placeholder="you@organization.et"
              className={`block w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 transition ${
                emailError
                  ? 'border-rose-300 focus:ring-rose-500'
                  : 'border-slate-300'
              }`}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? 'resend-email-error' : undefined}
            />
          </div>
          {emailError && (
            <p
              id="resend-email-error"
              role="alert"
              className="mt-1.5 text-xs text-rose-600 font-medium"
            >
              {emailError}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading || cooldownRemaining > 0}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Sending verification link...</span>
            </>
          ) : cooldownRemaining > 0 ? (
            <span>Resend available in {cooldownRemaining}s</span>
          ) : (
            <span>Resend verification email</span>
          )}
        </button>
      </form>
    </div>
  );
}
