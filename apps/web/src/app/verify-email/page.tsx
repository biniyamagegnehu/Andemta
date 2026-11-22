import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { AuthCard } from '@/components/auth/auth-card';
import { VerifyEmailContent } from '@/components/auth/verify-email-content';

export const metadata: Metadata = {
  title: 'Verify Email — Andemta',
  description: 'Verify your email address for your Andemta account.',
};

function VerifyEmailFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-10 space-y-4">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      <p className="text-sm text-slate-600">Loading email verification...</p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthCard
      title="Email Verification"
      subtitle="Confirming your Andemta account email"
      footer={
        <p>
          Need help?{' '}
          <Link
            href="/"
            className="font-semibold text-emerald-600 hover:text-emerald-700 transition"
          >
            Return to Home
          </Link>
        </p>
      }
    >
      <Suspense fallback={<VerifyEmailFallback />}>
        <VerifyEmailContent />
      </Suspense>
    </AuthCard>
  );
}
