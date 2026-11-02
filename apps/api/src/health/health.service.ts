import { Injectable } from '@nestjs/common';

export interface HealthData {
  status: 'ok';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  environment: string;
}

@Injectable()
export class HealthService {
  check(): HealthData {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'andemta-api',
      version: '0.1.0',
      uptime: Math.round(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
