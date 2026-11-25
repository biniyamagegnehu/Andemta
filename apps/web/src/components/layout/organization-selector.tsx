'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  ChevronDown,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useOrganizations } from '@/context/organization-context';
import type { OrganizationType } from '@/lib/api';

function formatOrganizationType(type: OrganizationType): string {
  switch (type) {
    case 'BUSINESS':
      return 'Business';
    case 'UNIVERSITY':
      return 'University';
    default:
      return 'Other';
  }
}

export function OrganizationSelector() {
  const {
    organizations,
    selectedOrganization,
    isLoading,
    error,
    selectOrganization,
    reloadOrganizations,
  } = useOrganizations();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (isLoading) {
    return (
      <div
        className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500"
        aria-live="polite"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        <span className="hidden sm:inline">Loading organizations…</span>
      </div>
    );
  }

  if (error) {
    return (
      <button
        type="button"
        onClick={() => void reloadOrganizations()}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
        title={error}
      >
        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">Retry organizations</span>
        <RefreshCw className="h-3 w-3 shrink-0" aria-hidden="true" />
      </button>
    );
  }

  if (organizations.length === 0) {
    return (
      <div className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
        <Building2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        <span className="hidden sm:inline">No organizations</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select active organization"
        className="inline-flex min-h-[40px] max-w-[220px] sm:max-w-[260px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-left text-sm font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        <Building2
          className="h-4 w-4 shrink-0 text-emerald-600"
          aria-hidden="true"
        />
        <span className="truncate">
          {selectedOrganization ? selectedOrganization.name : 'Select organization'}
        </span>
        {selectedOrganization && (
          <span className="hidden md:inline-flex shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            {formatOrganizationType(selectedOrganization.type)}
          </span>
        )}
        <ChevronDown
          className="h-4 w-4 shrink-0 text-slate-400"
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Your organizations"
          className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Your Organizations
          </div>
          <div className="max-h-64 overflow-y-auto space-y-0.5">
            {organizations.map((org) => {
              const isSelected = selectedOrganization?.id === org.id;
              return (
                <button
                  key={org.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    selectOrganization(org.id);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                    isSelected
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{org.name}</div>
                    <div className="text-xs text-slate-500">
                      {formatOrganizationType(org.type)}
                    </div>
                  </div>
                  {isSelected && (
                    <Check
                      className="h-4 w-4 shrink-0 text-emerald-600"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
