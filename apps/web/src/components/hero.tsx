import React from 'react';
import { ArrowRight, CheckCircle2, ShieldCheck, BarChart3 } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white via-slate-50/50 to-slate-100/60 py-20 sm:py-28">
      {/* Subtle decorative background element */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 transform blur-3xl opacity-20 pointer-events-none">
          <div className="aspect-[1155/678] w-[72rem] bg-gradient-to-tr from-emerald-600 to-teal-400" />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          {/* Tagline / Market badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
            <span>Ethiopian Consumer Research Marketplace</span>
          </div>

          {/* Main Headline */}
          <h1 className="mt-8 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
            Better Research.{' '}
            <span className="text-emerald-700">Better Decisions.</span>
          </h1>

          {/* Subheading / Value explanation */}
          <p className="mt-6 text-lg leading-8 text-slate-600 sm:text-xl">
            Andemta connects organizations, businesses, and universities with real
            consumers across Ethiopia to collect targeted feedback, validate new
            products, and generate actionable research insights.
          </p>

          {/* Call to Actions */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#get-started"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 transition"
            >
              For Organizations
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#participants"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3.5 text-base font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              Join as Participant
            </a>
          </div>

          {/* Trust points */}
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left pt-8 border-t border-slate-200/80">
            <div className="flex items-start gap-3 rounded-lg p-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Demographic Targeting</p>
                <p className="text-xs text-slate-500">Reach verified participants across diverse regions and backgrounds.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg p-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900">High-Quality Data</p>
                <p className="text-xs text-slate-500">Structured survey tooling and validated response integrity.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg p-2">
              <BarChart3 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Actionable Reports</p>
                <p className="text-xs text-slate-500">Transform localized feedback into confident business strategies.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

