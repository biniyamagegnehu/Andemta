import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { AuthCard } from '@/components/auth/auth-card';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = {
  title: 'Sign In — Andemta',
  description: 'Sign in to your Andemta account to access consumer research studies and insights.',
};

function LoginFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-10 space-y-4">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      <p className="text-sm text-slate-600">Loading sign-in form...</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your Andemta account"
      footer={
        <p>
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="font-semibold text-emerald-600 hover:text-emerald-700 transition"
          >
            Create an account
          </Link>
        </p>
      }
    >
      <Suspense fallback={<LoginFallback />}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
