'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { authClient, ApiError, getSafeRedirectUrl } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import { GoogleAuthButton } from './google-auth-button';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapOAuthError(code: string | null): string | null {
  if (!code) return null;

  switch (code) {
    case 'account_linking_required':
      return 'An account already exists with this email address. Please log in with your password to link your Google account.';
    case 'unverified_email':
      return 'Your Google email address is unverified. Please verify your email with Google or register directly.';
    case 'access_denied':
      return 'Google sign-in was cancelled or access was denied.';
    case 'user_already_has_google_account':
      return 'Your account is already linked to a Google account.';
    case 'account_already_linked_to_other_user':
      return 'This Google account is already linked to another user account.';
    case 'email_conflict':
      return 'An account conflict occurred with this email address.';
    case 'auth_failed':
      return 'Google authentication was unsuccessful. Please sign in with your email and password.';
    default:
      return 'Authentication failed. Please check your credentials and try again.';
  }
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const oauthErrorCode = searchParams.get('error');

  const { loginState, isAuthenticated } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Field-level error state
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Form-level state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isUnverifiedEmail, setIsUnverifiedEmail] = useState(false);

  // Populate OAuth failure message from redirect query parameters if present
  useEffect(() => {
    if (oauthErrorCode) {
      setServerError(mapOAuthError(oauthErrorCode));
    }
  }, [oauthErrorCode]);

  // If already authenticated, redirect to destination
  useEffect(() => {
    if (isAuthenticated) {
      router.push(getSafeRedirectUrl(returnUrl));
    }
  }, [isAuthenticated, returnUrl, router]);

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
    setEmailError(null);
    return true;
  };

  const validatePassword = (val: string): boolean => {
    if (!val) {
      setPasswordError('Password is required');
      return false;
    }
    setPasswordError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setIsUnverifiedEmail(false);

    if (isSubmitting) return;

    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);

    if (!isEmailValid || !isPasswordValid) {
      return;
    }

    setIsSubmitting(true);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      const response = await authClient.login({
        email: normalizedEmail,
        password, // Raw password preserved without modification
      });

      // Update Phase 3.10 authentication state
      loginState(response);

      // Navigate to sanitized internal post-login destination
      const safePath = getSafeRedirectUrl(returnUrl);
      router.push(safePath);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          // Check if failure is due to unverified email address
          if (
            err.message.toLowerCase().includes('email verification is required')
          ) {
            setIsUnverifiedEmail(true);
            setServerError(
              'Email verification is required before logging in. Please check your inbox for the verification link.',
            );
          } else {
            // Generic message prevents account enumeration
            setServerError(
              'Invalid email or password. Please verify your credentials and try again.',
            );
          }
        } else if (err.status === 429) {
          setServerError(
            'Too many failed login attempts. Please wait a few minutes before trying again.',
          );
        } else if (err.isNetworkError) {
          setServerError(
            'Unable to connect to the server. Please verify your internet connection and try again.',
          );
        } else {
          setServerError(
            err.message || 'Login failed. Please try again later.',
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
    <div className="space-y-6">
      {/* Continue with Google */}
      <div>
        <GoogleAuthButton disabled={isSubmitting} />
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-3 text-slate-500 font-medium tracking-wider">
            Or continue with email
          </span>
        </div>
      </div>

      {/* Server / Validation Error Notice */}
      {serverError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-xs text-rose-800 flex items-start gap-3"
        >
          {isUnverifiedEmail ? (
            <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1.5 flex-1">
            <p className="font-medium">{serverError}</p>
            {isUnverifiedEmail && (
              <p className="pt-1">
                <Link
                  href={`/resend-verification?email=${encodeURIComponent(
                    email.trim().toLowerCase(),
                  )}`}
                  className="font-semibold underline hover:text-rose-950 transition"
                >
                  Didn&apos;t receive the email? Resend verification link &rarr;
                </Link>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Email Field */}
        <div>
          <label
            htmlFor="login-email"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
          >
            Email address
          </label>
          <div className="relative mt-1.5 rounded-lg">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Mail className="h-4 w-4 text-slate-400" aria-hidden="true" />
            </div>
            <input
              id="login-email"
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
                emailError
                  ? 'border-rose-300 focus:ring-rose-500'
                  : 'border-slate-300'
              }`}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? 'login-email-error' : undefined}
            />
          </div>
          {emailError && (
            <p
              id="login-email-error"
              role="alert"
              className="mt-1.5 text-xs text-rose-600 font-medium"
            >
              {emailError}
            </p>
          )}
        </div>

        {/* Password Field */}
        <div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative mt-1.5 rounded-lg">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Lock className="h-4 w-4 text-slate-400" aria-hidden="true" />
            </div>
            <input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) validatePassword(e.target.value);
              }}
              onBlur={() => validatePassword(password)}
              disabled={isSubmitting}
              placeholder="Enter your password"
              className={`block w-full rounded-lg border py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 transition ${
                passwordError
                  ? 'border-rose-300 focus:ring-rose-500'
                  : 'border-slate-300'
              }`}
              aria-invalid={!!passwordError}
              aria-describedby={
                passwordError ? 'login-password-error' : undefined
              }
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
              id="login-password-error"
              role="alert"
              className="mt-1.5 text-xs text-rose-600 font-medium"
            >
              {passwordError}
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
                <span>Signing in...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
