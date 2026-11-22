import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { ResendVerificationForm } from '@/components/auth/resend-verification-form';

export const metadata: Metadata = {
  title: 'Resend Verification — Andemta',
  description: 'Request a new email verification link for your Andemta account.',
};

export default function ResendVerificationPage() {
  return (
    <AuthCard
      title="Resend Verification"
      subtitle="Enter your email to receive a new verification link"
      footer={
        <p>
          Remembered your details?{' '}
          <Link
            href="/login"
            className="font-semibold text-emerald-600 hover:text-emerald-700 transition"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <ResendVerificationForm />
    </AuthCard>
  );
}
