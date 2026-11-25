'use client';

import React, { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/use-auth';
import { OrganizationProvider } from '@/context/organization-context';
import { getSafeRedirectUrl } from '@/lib/api';
import { AppSidebar } from './app-sidebar';
import { MobileNavigation } from './mobile-navigation';
import { AppHeader } from './app-header';

export interface AuthenticatedLayoutProps {
  children: ReactNode;
}

/**
 * Reusable authenticated application shell.
 *
 * - Waits for Phase 3 AuthProvider initialization before deciding on redirects.
 * - Redirects unauthenticated users to /login with a safe internal returnUrl.
 * - Renders persistent desktop sidebar, mobile drawer, header, organization selector,
 *   user account menu, and main content area.
 */
export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isInitialized } = useAuth();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isInitialized) return;
    if (!isAuthenticated) {
      const safeReturnUrl = getSafeRedirectUrl(pathname, '/dashboard');
      router.replace(`/login?returnUrl=${encodeURIComponent(safeReturnUrl)}`);
    }
  }, [isInitialized, isAuthenticated, pathname, router]);

  // Wait for initial session check before rendering protected shell or redirecting
  if (!isInitialized || !isAuthenticated) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-slate-600"
        role="status"
        aria-live="polite"
      >
        <Loader2
          className="h-8 w-8 animate-spin text-emerald-600"
          aria-hidden="true"
        />
        <p className="mt-3 text-sm font-medium">
          {!isInitialized
            ? 'Checking your session…'
            : 'Redirecting to sign in…'}
        </p>
      </div>
    );
  }

  return (
    <OrganizationProvider>
      <div className="flex min-h-screen w-full overflow-x-hidden bg-slate-50 text-slate-900">
        <AppSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        />

        <MobileNavigation
          isOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader onOpenMobileMenu={() => setMobileMenuOpen(true)} />

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </OrganizationProvider>
  );
}
