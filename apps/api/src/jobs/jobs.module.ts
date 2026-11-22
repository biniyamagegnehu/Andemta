import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import {
  INFRASTRUCTURE_PING_QUEUE,
  AUTH_CLEANUP_QUEUE,
} from './constants/job.constants';
import { InfrastructurePingProcessor } from './processors/infrastructure-ping.processor';
import { AuthCleanupProcessor } from './processors/auth-cleanup.processor';
import { JobsService } from './jobs.service';
import { AuthModule } from '../modules/auth/auth.module';

@Module({
  imports: [
    AuthModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host', 'localhost'),
          port: configService.get<number>('redis.port', 6379),
          password: configService.get<string>('redis.password') || undefined,
          tls: configService.get<boolean>('redis.tlsEnabled', false)
            ? { rejectUnauthorized: true }
            : undefined,
          // Mandatory for BullMQ worker connections
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          retryStrategy: (times: number) => {
            if (process.env.NODE_ENV === 'test') {
              return null;
            }
            return Math.min(times * 100, 3000);
          },
        },
      }),
    }),
    BullModule.registerQueue({
      name: INFRASTRUCTURE_PING_QUEUE,
    }),
    BullModule.registerQueue({
      name: AUTH_CLEANUP_QUEUE,
    }),
  ],
  providers: [
    JobsService,
    InfrastructurePingProcessor,
    AuthCleanupProcessor,
  ],
  exports: [JobsService, BullModule],
})
export class JobsModule {}

