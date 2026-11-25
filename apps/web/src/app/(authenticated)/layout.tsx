import React, { type ReactNode } from 'react';
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout';

export default function AuthenticatedGroupLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}
