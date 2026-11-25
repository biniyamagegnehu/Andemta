import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
import { JobsModule } from './jobs/jobs.module';
import { HealthModule } from './health/health.module';
import { ExampleModule } from './example/example.module';
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';
import { PermissionsGuard } from './modules/rbac/guards/permissions.guard';
import { AppThrottlerGuard } from './modules/auth/guards/app-throttler.guard';
import { RedisThrottlerStorage } from './modules/auth/throttler/redis-throttler-storage.service';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { REQUEST_ID_HEADER } from './common/constants';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    JobsModule,
    AuthModule,
    RbacModule,
    OrganizationsModule,
    AdminUsersModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule, AppConfigModule],
      inject: [RedisService, ConfigService],
      useFactory: (redisService: RedisService, configService: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60000,
            limit: 60,
          },
        ],
        storage: new RedisThrottlerStorage(redisService, configService),
      }),
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction =
          configService.get<string>('nodeEnv') === 'production';

        return {
          pinoHttp: {
            genReqId: (req) =>
              (req.headers[REQUEST_ID_HEADER] as string) ||
              (req as { id?: string }).id ||
              'req-init',
            level: isProduction ? 'info' : 'debug',
            transport: isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    singleLine: true,
                    colorize: true,
                    translateTime: 'SYS:standard',
                  },
                },
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["set-cookie"]',
              'req.body.password',
              'req.body.newPassword',
              'req.body.token',
              'req.body.refreshToken',
              'req.query.code',
              'req.query.state',
            ],
          },
        };
      },
    }),
    HealthModule,
    ExampleModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Register Request ID middleware across all HTTP routes
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
