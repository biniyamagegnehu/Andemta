'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Mail } from 'lucide-react';
import { useAuth } from '@/context/use-auth';

/**
 * Extracts safe initials from a user's email address for avatar display.
 */
export function getUserInitials(email?: string | null): string {
  if (!email) return 'U';
  const localPart = email.split('@')[0] || '';
  const cleaned = localPart.replace(/[^a-zA-Z0-9]/g, '');
  if (cleaned.length >= 2) {
    return cleaned.slice(0, 2).toUpperCase();
  }
  return (cleaned[0] || 'U').toUpperCase();
}

export function UserAccountMenu() {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
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

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      setIsOpen(false);
      router.replace('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const initials = getUserInitials(user?.email);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="User account menu"
        className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
          {initials}
        </span>
        <span className="hidden md:inline max-w-[160px] truncate text-sm text-slate-700">
          {user?.email || 'Account'}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-slate-400"
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="Account options"
          className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
        >
          <div className="border-b border-slate-100 px-2.5 py-2">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{user?.email}</span>
            </div>
            {user?.id && (
              <p className="mt-1 truncate text-[11px] text-slate-400">
                ID: {user.id}
              </p>
            )}
          </div>

          <div className="pt-1.5">
            <button
              type="button"
              role="menuitem"
              disabled={isLoggingOut || isLoading}
              onClick={() => void handleLogout()}
              className="flex min-h-[40px] w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{isLoggingOut ? 'Signing out…' : 'Sign out'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
