'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Activity, CheckCircle, AlertCircle, RefreshCw, Server } from 'lucide-react';

interface HealthData {
  status: string;
  timestamp: string;
  service: string;
  version: string;
  uptime?: number;
  environment?: string;
}

export function ApiStatus() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

  const checkApiHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = `${apiUrl}/health`;
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      const healthData =
        json && typeof json === 'object' && 'data' in json && json.data
          ? (json.data as HealthData)
          : (json as HealthData);
      setHealth(healthData);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to reach API server';
      setError(message);
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    checkApiHealth();
  }, [checkApiHealth]);

  return (
    <section id="system-health" className="py-16 bg-white border-t border-slate-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Server className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Backend API Health & Connectivity
                </h3>
                <p className="text-xs text-slate-500">
                  Target Endpoint: <code className="text-slate-800 bg-slate-200/80 px-1.5 py-0.5 rounded font-mono">{apiUrl}/health</code>
                </p>
              </div>
            </div>

            <button
              onClick={checkApiHealth}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Re-check Health
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-200">
            {loading && !health && !error && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Activity className="h-4 w-4 animate-pulse text-emerald-600" />
                <span>Checking API connectivity at {apiUrl}/health...</span>
              </div>
            )}

            {health && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                  <span>API Service Online (HTTP 200 OK)</span>
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">Service</span>
                    <span className="font-semibold text-slate-800">{health.service}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Status</span>
                    <span className="font-semibold uppercase text-emerald-700">{health.status}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Version</span>
                    <span className="font-semibold text-slate-800">{health.version}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Environment</span>
                    <span className="font-semibold text-slate-800">{health.environment || 'development'}</span>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-slate-500">
                  Last verified: {new Date(health.timestamp).toLocaleTimeString()}
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  <span>Backend Not Responding Locally</span>
                </div>
                <p className="mt-2 text-xs text-amber-700">
                  {error}. Start the NestJS backend on port 4000 (<code className="bg-amber-100 px-1 py-0.5 rounded font-mono">npm run dev:api</code>) to establish communication.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

