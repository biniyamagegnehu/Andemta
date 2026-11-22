'use client';

import React, { type ReactNode } from 'react';
import { AuthProvider } from '@/context/auth-context';

export interface ClientAuthProviderProps {
  children: ReactNode;
}

/**
 * Client-side AuthProvider wrapper to safely bridge Server-Side Layouts with client React Context.
 */
export function ClientAuthProvider({ children }: ClientAuthProviderProps) {
  return <AuthProvider>{children}</AuthProvider>;
}
