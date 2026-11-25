'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  AUTHENTICATED_NAV_ITEMS,
  filterNavigationItems,
} from '@/config/navigation';
import { useAuth } from '@/context/use-auth';
import { useOrganizations } from '@/context/organization-context';
import { useAuthorization } from '@/context/authorization-context';
import { NavIcon } from './nav-icon';

export interface AppSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function AppSidebar({ collapsed, onToggleCollapse }: AppSidebarProps) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const { selectedOrganizationId } = useOrganizations();
  const {
    isSystemLoading,
    isOrganizationLoading,
    error,
    systemPermissions,
    organizationPermissions,
  } = useAuthorization();

  const visibleNavItems = filterNavigationItems(AUTHENTICATED_NAV_ITEMS, {
    isAuthenticated,
    isSystemLoading,
    isOrganizationLoading,
    hasError: error !== null,
    systemPermissions,
    organizationPermissions,
    hasSelectedOrganization: selectedOrganizationId !== null,
  });

  return (
    <aside
      aria-label="Primary sidebar navigation"
      className={`hidden lg:flex lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white transition-all duration-200 ${
        collapsed ? 'lg:w-20' : 'lg:w-64'
      }`}
    >
      {/* Brand header */}
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 overflow-hidden"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 font-bold text-white shadow-sm">
            A
          </div>
          {!collapsed && (
            <div className="flex flex-col truncate">
              <span className="text-base font-bold tracking-tight text-slate-900">
                Andemta
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-700">
                Marketplace
              </span>
            </div>
          )}
        </Link>

        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden lg:inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Navigation items */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const isActive =
            pathname === item.href || pathname?.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <NavIcon
                icon={item.icon}
                className={`h-5 w-5 shrink-0 ${
                  isActive
                    ? 'text-emerald-600'
                    : 'text-slate-400 group-hover:text-slate-600'
                }`}
              />
              {!collapsed && (
                <span className="flex-1 truncate">{item.label}</span>
              )}
              {!collapsed && item.isPlaceholder && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                  Soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
