import React, { type ReactNode } from 'react';
import Link from 'next/link';

export interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col justify-center py-12 sm:px-6 lg:px-8 bg-slate-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand Header */}
        <div className="flex justify-center">
          <Link href="/" className="flex items-center gap-2 group" aria-label="Andemta Home">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 font-bold text-white shadow-md transition group-hover:bg-emerald-700">
              A
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xl font-bold tracking-tight text-slate-900">
                Andemta
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                Consumer Research
              </span>
            </div>
          </Link>
        </div>

        <h1 className="mt-6 text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-center text-sm text-slate-600">
            {subtitle}
          </p>
        )}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-8 shadow-sm sm:px-10">
          {children}
        </div>

        {footer && <div className="mt-6 text-center text-sm text-slate-600">{footer}</div>}
      </div>
    </div>
  );
}
