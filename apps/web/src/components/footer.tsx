import React from 'react';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 font-bold text-white text-xs">
                A
              </div>
              <span className="text-base font-bold text-slate-900">
                Andemta
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-md">
              Andemta is an Ethiopian consumer research marketplace empowering businesses, universities, and organizations with authentic consumer intelligence.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs text-slate-500">
            <a href="#about" className="hover:text-slate-900 transition">About</a>
            <a href="#capabilities" className="hover:text-slate-900 transition">Capabilities</a>
            <a href="#how-it-works" className="hover:text-slate-900 transition">How It Works</a>
            <a href="#system-health" className="hover:text-slate-900 transition">System Health</a>
            <span className="text-slate-300">|</span>
            <span>Addis Ababa, Ethiopia</span>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-100 pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-400">
          <p>© {new Date().getFullYear()} Andemta Technologies. All rights reserved.</p>
          <p>Phase 0 Foundation Build</p>
        </div>
      </div>
    </footer>
  );
}

