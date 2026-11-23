import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { AuthCard } from '@/components/auth/auth-card';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export const metadata: Metadata = {
  title: 'Set New Password — Andemta',
  description: 'Choose a strong new password for your Andemta account.',
};

function ResetPasswordFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-10 space-y-4">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      <p className="text-sm text-slate-600">Loading password reset form...</p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Set new password"
      subtitle="Choose a secure password for your account"
      footer={
        <p>
          Remember your password?{' '}
          <Link
            href="/login"
            className="font-semibold text-emerald-600 hover:text-emerald-700 transition"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <Suspense fallback={<ResetPasswordFallback />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
