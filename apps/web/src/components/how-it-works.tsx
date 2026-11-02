import React from 'react';
import { Building2, UserPlus } from 'lucide-react';

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 bg-slate-50 border-t border-slate-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Platform Workflow
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            A Two-Sided Marketplace Built on Trust
          </p>
          <p className="mt-4 text-base text-slate-600">
            Connecting research commissioners with motivated participants across Ethiopia through a transparent, rewarding process.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* For Organizations */}
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 font-bold">
                <Building2 className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">
                For Organizations & Universities
              </h3>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Launch research campaigns, recruit target cohorts, and access structured findings with confidence.
            </p>
            <ol className="mt-6 space-y-4">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  1
                </span>
                <span className="text-sm text-slate-700">
                  <strong className="text-slate-900 font-semibold">Define Criteria:</strong> Specify research objectives, survey questions, or product testing parameters.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  2
                </span>
                <span className="text-sm text-slate-700">
                  <strong className="text-slate-900 font-semibold">Recruit Cohorts:</strong> Match with verified Ethiopian participants filtered by demographic targets.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  3
                </span>
                <span className="text-sm text-slate-700">
                  <strong className="text-slate-900 font-semibold">Analyze Results:</strong> Receive real-time structured data, visualizations, and actionable insights.
                </span>
              </li>
            </ol>
          </div>

          {/* For Participants */}
          <div id="participants" className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 font-bold">
                <UserPlus className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">
                For Ethiopian Participants
              </h3>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Share your perspective, test innovative products, and earn rewards for meaningful research participation.
            </p>
            <ol className="mt-6 space-y-4">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  1
                </span>
                <span className="text-sm text-slate-700">
                  <strong className="text-slate-900 font-semibold">Create Profile:</strong> Register your demographic details to unlock eligible research studies.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  2
                </span>
                <span className="text-sm text-slate-700">
                  <strong className="text-slate-900 font-semibold">Participate:</strong> Complete surveys, evaluate new apps, or test physical consumer goods.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  3
                </span>
                <span className="text-sm text-slate-700">
                  <strong className="text-slate-900 font-semibold">Earn Rewards:</strong> Receive guaranteed rewards and compensation for your verified contributions.
                </span>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

