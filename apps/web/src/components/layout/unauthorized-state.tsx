import React from 'react';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export interface UnauthorizedStateProps {
  title?: string;
  description?: string;
}

/**
 * 403-style unauthorized state displayed when an authenticated user lacks
 * the required SYSTEM or ORGANIZATION permission for a route.
 */
export function UnauthorizedState({
  title = 'Access Denied (403)',
  description = 'You do not have permission to view this page in the current context.',
}: UnauthorizedStateProps) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-lg flex-col items-center justify-center rounded-xl border border-rose-200 bg-white px-6 py-12 text-center shadow-xs"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <ShieldAlert className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Back to Dashboard
        </Link>
        <Link
          href="/organizations"
          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          View Organizations
        </Link>
      </div>
    </div>
  );
}
