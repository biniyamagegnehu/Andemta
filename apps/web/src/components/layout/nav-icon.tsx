import React from 'react';
import {
  BarChart3,
  Building2,
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  PackageCheck,
  Users,
} from 'lucide-react';
import type { NavIconKey } from '@/config/navigation';

export function NavIcon({
  icon,
  className = 'h-5 w-5',
}: {
  icon: NavIconKey;
  className?: string;
}) {
  switch (icon) {
    case 'dashboard':
      return <LayoutDashboard className={className} aria-hidden="true" />;
    case 'organizations':
      return <Building2 className={className} aria-hidden="true" />;
    case 'research':
      return <FlaskConical className={className} aria-hidden="true" />;
    case 'surveys':
      return <ClipboardList className={className} aria-hidden="true" />;
    case 'product-testing':
      return <PackageCheck className={className} aria-hidden="true" />;
    case 'participants':
      return <Users className={className} aria-hidden="true" />;
    case 'reports':
      return <BarChart3 className={className} aria-hidden="true" />;
  }
}
