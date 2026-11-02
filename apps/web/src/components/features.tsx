import React from 'react';
import { ClipboardList, FlaskConical, UserCheck, TrendingUp } from 'lucide-react';

const capabilities = [
  {
    name: 'Surveys & Consumer Feedback',
    description:
      'Design targeted surveys to capture authentic sentiment, market opinions, and behavioral patterns from Ethiopian consumers.',
    icon: ClipboardList,
  },
  {
    name: 'Product & Concept Testing',
    description:
      'Put prototypes, digital apps, packaging, and concepts directly into the hands of real users before major commercial launches.',
    icon: FlaskConical,
  },
  {
    name: 'Targeted Participant Recruitment',
    description:
      'Find the exact audience your research demands with demographic, geographic, and lifestyle filtering.',
    icon: UserCheck,
  },
  {
    name: 'Structured Data & Insights',
    description:
      'Generate clear, auditable analytics and executive reports to de-risk decisions and drive sustainable growth.',
    icon: TrendingUp,
  },
];

export function Features() {
  return (
    <section id="capabilities" className="py-20 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Marketplace Capabilities
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Everything Needed for Rigorous Consumer Research
          </p>
          <p className="mt-4 text-base leading-7 text-slate-600">
            Built to provide researchers, enterprises, and institutions with reliable access to Ethiopian consumer audiences.
          </p>
        </div>

        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-12 lg:max-w-none lg:grid-cols-4">
            {capabilities.map((feature) => (
              <div
                key={feature.name}
                className="flex flex-col rounded-2xl border border-slate-200/90 bg-slate-50/60 p-7 transition hover:border-emerald-300 hover:shadow-md"
              >
                <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-slate-900">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
                    <feature.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-sm leading-6 text-slate-600">
                  <p className="font-semibold text-slate-900 text-base mb-2">
                    {feature.name}
                  </p>
                  <p className="flex-auto text-slate-600 leading-relaxed">
                    {feature.description}
                  </p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

