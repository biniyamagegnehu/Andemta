'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Menu, X, ArrowRight } from 'lucide-react';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 font-bold text-white shadow-sm">
              A
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight text-slate-900">
                Andemta
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-700">
                Consumer Research
              </span>
            </div>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex md:items-center md:gap-8 text-sm font-medium text-slate-600">
          <a href="#about" className="transition-colors hover:text-emerald-700">
            About
          </a>
          <a href="#capabilities" className="transition-colors hover:text-emerald-700">
            Capabilities
          </a>
          <a href="#how-it-works" className="transition-colors hover:text-emerald-700">
            How It Works
          </a>
          <a href="#system-health" className="transition-colors hover:text-emerald-700">
            System Health
          </a>
        </nav>

        {/* Action Buttons */}
        <div className="hidden md:flex md:items-center md:gap-4">
          <button
            type="button"
            className="rounded-lg px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Sign In
          </button>
          <a
            href="#get-started"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            Get Started
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        {/* Mobile menu button */}
        <div className="flex md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="inline-flex items-center justify-center rounded-md p-2 text-slate-700 hover:bg-slate-100 focus:outline-none"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 bg-white px-4 pt-2 pb-6 space-y-3">
          <a
            href="#about"
            onClick={() => setMobileMenuOpen(false)}
            className="block rounded-lg px-3 py-2 text-base font-medium text-slate-700 hover:bg-slate-100"
          >
            About
          </a>
          <a
            href="#capabilities"
            onClick={() => setMobileMenuOpen(false)}
            className="block rounded-lg px-3 py-2 text-base font-medium text-slate-700 hover:bg-slate-100"
          >
            Capabilities
          </a>
          <a
            href="#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="block rounded-lg px-3 py-2 text-base font-medium text-slate-700 hover:bg-slate-100"
          >
            How It Works
          </a>
          <a
            href="#system-health"
            onClick={() => setMobileMenuOpen(false)}
            className="block rounded-lg px-3 py-2 text-base font-medium text-slate-700 hover:bg-slate-100"
          >
            System Health
          </a>
          <div className="pt-4 border-t border-slate-200 flex flex-col gap-2">
            <button
              type="button"
              className="w-full rounded-lg border border-slate-300 py-2.5 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Sign In
            </button>
            <a
              href="#get-started"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full rounded-lg bg-emerald-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Get Started
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

