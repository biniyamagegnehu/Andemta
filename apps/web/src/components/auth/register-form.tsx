'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { authClient, ApiError } from '@/lib/api';
import { ResendVerificationForm } from './resend-verification-form';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Field validation errors
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);

  // Form-level state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isConflictError, setIsConflictError] = useState(false);
  const [isRegisteredSuccess, setIsRegisteredSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

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

  const validatePassword = (val: string): boolean => {
    if (!val) {
      setPasswordError('Password is required');
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
      setConfirmPasswordError('Please confirm your password');
      return false;
    }
    if (confirmVal !== passwordVal) {
      setConfirmPasswordError('Passwords do not match');
      return false;
    }
    setConfirmPasswordError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setIsConflictError(false);

    if (isSubmitting) return;

    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    const isConfirmValid = validateConfirmPassword(confirmPassword, password);

    if (!isEmailValid || !isPasswordValid || !isConfirmValid) {
      return;
    }

    setIsSubmitting(true);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      // confirmPassword is never passed to backend
      await authClient.register({
        email: normalizedEmail,
        password, // Raw password preserved with spaces and Unicode
      });

      setRegisteredEmail(normalizedEmail);
      setIsRegisteredSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setIsConflictError(true);
          setServerError(
            'An account with this email already exists. You can sign in or reset your password if you already have an account.',
          );
        } else if (err.status === 400 && err.errors && err.errors.length > 0) {
          // Map backend validation errors to field states
          err.errors.forEach((e) => {
            if (e.field === 'email') setEmailError(e.message);
            if (e.field === 'password') setPasswordError(e.message);
          });
          setServerError('Please review and correct the highlighted fields.');
        } else if (err.isNetworkError) {
          setServerError(
            'Unable to reach the server. Please check your internet connection and try again.',
          );
        } else {
          setServerError(
            err.message || 'Registration failed. Please try again later.',
          );
        }
      } else {
        setServerError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // SUCCESS CONFIRMATION STATE
  if (isRegisteredSuccess) {
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
            We have created your account and sent a verification link to{' '}
            <span className="font-semibold text-slate-900">{registeredEmail}</span>.
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-left text-xs text-emerald-800 space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-emerald-900">
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Action Required</span>
          </div>
          <p>
            Please click the link in your email to activate your account. You will not be able to log in until your email is verified.
          </p>
        </div>

        <div className="pt-2 border-t border-slate-200 text-left">
          <p className="text-xs font-semibold text-slate-700 mb-2">
            Didn&apos;t receive the email?
          </p>
          <ResendVerificationForm defaultEmail={registeredEmail} compact />
        </div>

        <div className="pt-4 border-t border-slate-200">
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition"
          >
            <span>Proceed to Sign In</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  // REGISTRATION FORM
  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {serverError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-xs text-rose-800 flex items-start gap-3"
        >
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">{serverError}</p>
            {isConflictError && (
              <p className="pt-1">
                <Link
                  href="/login"
                  className="font-semibold underline hover:text-rose-950 transition"
                >
                  Sign in to your account &rarr;
                </Link>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Email Input */}
      <div>
        <label
          htmlFor="register-email"
          className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
        >
          Email address
        </label>
        <div className="relative mt-1.5 rounded-lg">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Mail className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <input
            id="register-email"
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
            aria-describedby={emailError ? 'register-email-error' : undefined}
          />
        </div>
        {emailError && (
          <p
            id="register-email-error"
            role="alert"
            className="mt-1.5 text-xs text-rose-600 font-medium"
          >
            {emailError}
          </p>
        )}
      </div>

      {/* Password Input */}
      <div>
        <label
          htmlFor="register-password"
          className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
        >
          Password
        </label>
        <div className="relative mt-1.5 rounded-lg">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Lock className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <input
            id="register-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordError) validatePassword(e.target.value);
              if (confirmPassword) validateConfirmPassword(confirmPassword, e.target.value);
            }}
            onBlur={() => validatePassword(password)}
            disabled={isSubmitting}
            placeholder="At least 12 characters"
            className={`block w-full rounded-lg border py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 transition ${
              passwordError ? 'border-rose-300 focus:ring-rose-500' : 'border-slate-300'
            }`}
            aria-invalid={!!passwordError}
            aria-describedby="register-password-requirements register-password-error"
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
            id="register-password-error"
            role="alert"
            className="mt-1.5 text-xs text-rose-600 font-medium"
          >
            {passwordError}
          </p>
        )}

        {/* Password Policy Helpers */}
        <div
          id="register-password-requirements"
          className="mt-2 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600 space-y-1"
        >
          <div className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                password.length >= 12 && password.length <= 128
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
          htmlFor="register-confirm-password"
          className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
        >
          Confirm password
        </label>
        <div className="relative mt-1.5 rounded-lg">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Lock className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <input
            id="register-confirm-password"
            name="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (confirmPasswordError) validateConfirmPassword(e.target.value, password);
            }}
            onBlur={() => validateConfirmPassword(confirmPassword, password)}
            disabled={isSubmitting}
            placeholder="Re-enter your password"
            className={`block w-full rounded-lg border py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 transition ${
              confirmPasswordError
                ? 'border-rose-300 focus:ring-rose-500'
                : 'border-slate-300'
            }`}
            aria-invalid={!!confirmPasswordError}
            aria-describedby={
              confirmPasswordError ? 'register-confirm-password-error' : undefined
            }
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
        {confirmPasswordError && (
          <p
            id="register-confirm-password-error"
            role="alert"
            className="mt-1.5 text-xs text-rose-600 font-medium"
          >
            {confirmPasswordError}
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
              <span>Creating your account...</span>
            </>
          ) : (
            <span>Create Account</span>
          )}
        </button>
      </div>
    </form>
  );
}
