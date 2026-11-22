import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { RegisterForm } from '@/components/auth/register-form';

export const metadata: Metadata = {
  title: 'Create Account — Andemta',
  description:
    'Join Andemta, the Ethiopian Consumer Research Marketplace connecting organizations with research participants.',
};

export default function RegisterPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle="Join the consumer research marketplace for Ethiopia"
      footer={
        <p>
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-semibold text-emerald-600 hover:text-emerald-700 transition"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
