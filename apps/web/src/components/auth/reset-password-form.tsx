'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { authClient, ApiError } from '@/lib/api';

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Field validation states
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Form states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isTokenInvalid, setIsTokenInvalid] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // 1. Missing Token Handling
  if (!token || !token.trim()) {
    return (
      <div className="space-y-6 text-center py-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
          <AlertCircle className="h-8 w-8" />
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Reset Link Incomplete
          </h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            No reset token was found in this link. Please check the email you received or request a replacement reset link below.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/forgot-password"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
          >
            <span>Request a New Reset Link</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
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

  // 2. Success State Handling
  if (isSuccess) {
    return (
      <div className="space-y-6 text-center py-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shadow-sm">
          <CheckCircle2 className="h-8 w-8" />
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Password reset successful!
          </h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            Your account password has been updated. All previous sessions have been safely terminated.
            You can now sign in with your new password.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/login?reset=success"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 transition"
          >
            <span>Sign In to Your Account</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const validatePassword = (val: string): boolean => {
    if (!val) {
      setPasswordError('New password is required');
      return false;
    }
    if (val.length < 12) {
      setPasswordError('Password must be at least 12 characters long');
      return false;
    }
    if (val.length > 128) {
      setPasswordError('Password must be at most 128 characters long');
      return false;
    }
    setPasswordError(null);
    return true;
  };

  const validateConfirmPassword = (confirmVal: string, passwordVal: string): boolean => {
    if (!confirmVal) {
      setConfirmError('Please confirm your new password');
      return false;
    }
    if (confirmVal !== passwordVal) {
      setConfirmError('Passwords do not match');
      return false;
    }
    setConfirmError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setIsTokenInvalid(false);

    if (isSubmitting) return;

    const isPasswordValid = validatePassword(newPassword);
    const isConfirmValid = validateConfirmPassword(confirmPassword, newPassword);

    if (!isPasswordValid || !isConfirmValid) {
      return;
    }

    setIsSubmitting(true);

    try {
      // confirmPassword is never passed to backend
      await authClient.resetPassword({
        token: token.trim(),
        newPassword, // Raw password preserved without modification
      });

      setIsSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 400) {
          if (err.message.toLowerCase().includes('invalid or expired')) {
            setIsTokenInvalid(true);
            setServerError(
              'This password reset link is invalid, has expired, or has already been used. Please request a new one.',
            );
          } else if (err.errors && err.errors.length > 0) {
            err.errors.forEach((e) => {
              if (e.field === 'newPassword') setPasswordError(e.message);
            });
            setServerError('Please review the password requirements.');
          } else {
            setServerError(err.message || 'Unable to reset password.');
          }
        } else if (err.status === 429) {
          setServerError(
            'Too many attempts. Please wait a few minutes before trying again.',
          );
        } else if (err.isNetworkError) {
          setServerError(
            'Unable to connect to the server. Please verify your internet connection and try again.',
          );
        } else {
          setServerError(
            err.message || 'Unable to reset password. Please try again later.',
          );
        }
      } else {
        setServerError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {serverError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-xs text-rose-800 flex items-start gap-3"
        >
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1.5 flex-1">
            <p className="font-medium">{serverError}</p>
            {isTokenInvalid && (
              <p className="pt-1">
                <Link
                  href="/forgot-password"
                  className="font-semibold underline hover:text-rose-950 transition"
                >
                  Request a new password reset link &rarr;
                </Link>
              </p>
            )}
          </div>
        </div>
      )}

      {/* New Password Input */}
      <div>
        <label
          htmlFor="reset-new-password"
          className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
        >
          New password
        </label>
        <div className="relative mt-1.5 rounded-lg">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Lock className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <input
            id="reset-new-password"
            name="newPassword"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              if (passwordError) validatePassword(e.target.value);
              if (confirmPassword) validateConfirmPassword(confirmPassword, e.target.value);
            }}
            onBlur={() => validatePassword(newPassword)}
            disabled={isSubmitting}
            placeholder="At least 12 characters"
            className={`block w-full rounded-lg border py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 transition ${
              passwordError ? 'border-rose-300 focus:ring-rose-500' : 'border-slate-300'
            }`}
            aria-invalid={!!passwordError}
            aria-describedby="reset-password-requirements reset-password-error"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {passwordError && (
          <p
            id="reset-password-error"
            role="alert"
            className="mt-1.5 text-xs text-rose-600 font-medium"
          >
            {passwordError}
          </p>
        )}

        {/* Password Policy Helpers */}
        <div
          id="reset-password-requirements"
          className="mt-2 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600 space-y-1"
        >
          <div className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                newPassword.length >= 12 && newPassword.length <= 128
                  ? 'bg-emerald-500'
                  : 'bg-slate-300'
              }`}
            />
            <span>Must be between 12 and 128 characters long</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>Spaces and Unicode characters are supported</span>
          </div>
        </div>
      </div>

      {/* Confirm Password Input */}
      <div>
        <label
          htmlFor="reset-confirm-password"
          className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
        >
          Confirm new password
        </label>
        <div className="relative mt-1.5 rounded-lg">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Lock className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <input
            id="reset-confirm-password"
            name="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (confirmError) validateConfirmPassword(e.target.value, newPassword);
            }}
            onBlur={() => validateConfirmPassword(confirmPassword, newPassword)}
            disabled={isSubmitting}
            placeholder="Re-enter your new password"
            className={`block w-full rounded-lg border py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 transition ${
              confirmError ? 'border-rose-300 focus:ring-rose-500' : 'border-slate-300'
            }`}
            aria-invalid={!!confirmError}
            aria-describedby={confirmError ? 'reset-confirm-password-error' : undefined}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none"
            aria-label={
              showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
            }
            tabIndex={-1}
          >
            {showConfirmPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {confirmError && (
          <p
            id="reset-confirm-password-error"
            role="alert"
            className="mt-1.5 text-xs text-rose-600 font-medium"
          >
            {confirmError}
          </p>
        )}
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Updating password...</span>
            </>
          ) : (
            <span>Reset Password</span>
          )}
        </button>
      </div>

      <div className="pt-2 text-center">
        <Link
          href="/login"
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
        >
          Cancel and return to Sign In
        </Link>
      </div>
    </form>
  );
}
