/**
 * @andemta/shared
 * Foundational types, constants, and utilities for the Andemta monorepo.
 */

export const APP_NAME = 'Andemta';
export const APP_TAGLINE = 'Better Research. Better Decisions.';
export const APP_DESCRIPTION = 'Ethiopian Consumer Research Marketplace connecting organizations with consumers.';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}

export interface HealthStatusResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  service: string;
  version: string;
  environment?: string;
}

