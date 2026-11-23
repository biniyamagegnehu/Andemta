import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { AuthCard } from '@/components/auth/auth-card';
import { GoogleCallbackContent } from '@/components/auth/google-callback-content';

export const metadata: Metadata = {
  title: 'Completing Sign-In — Andemta',
  description: 'Completing Google OAuth authentication for Andemta.',
};

function GoogleCallbackFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-10 space-y-4">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      <p className="text-sm text-slate-600">Establishing session...</p>
    </div>
  );
}

export default function GoogleCallbackPage() {
  return (
    <AuthCard
      title="Google Sign-In"
      subtitle="Finalizing authentication"
      footer={
        <p>
          Having trouble?{' '}
          <Link
            href="/login"
            className="font-semibold text-emerald-600 hover:text-emerald-700 transition"
          >
            Return to Sign In
          </Link>
        </p>
      }
    >
      <Suspense fallback={<GoogleCallbackFallback />}>
        <GoogleCallbackContent />
      </Suspense>
    </AuthCard>
  );
}
